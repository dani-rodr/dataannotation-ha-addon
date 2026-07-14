// @ts-nocheck
const crypto = require('node:crypto');

const { fetchUsdToPhpRate, saveCurrencyState, shouldRefreshCurrencyRate } = require('../state/currency_conversion.ts');
const { loadWalletSyncState, saveWalletSyncState } = require('../state/wallet_sync_state.ts');
const { WalletApiClient } = require('../clients/wallet_api_client.ts');

const DEFAULT_STATE_PATH = '/data/wallet-sync-state.json';
const WALLET_CURRENCY = 'PHP';
const NOTE_PREFIX = 'DAWALLET';
const DEFAULT_BATCH_SIZE = 25;

class WalletSync {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.statePath = DEFAULT_STATE_PATH;
    this.client = config.wallet_token ? new WalletApiClient(config.wallet_token) : null;
    this.referenceData = null;
  }

  isEnabled() {
    return Boolean(this.config.wallet_write_enabled && this.config.wallet_token);
  }

  async processSync({ payments, fundsHistorySnapshot, includeFundsHistory, currencyState, now = new Date() }) {
    if (!this.isEnabled()) {
      return { enabled: false, changed: false };
    }

    if (!payments) {
      return { enabled: true, changed: false };
    }

    let state = loadWalletSyncState(this.statePath);
    if (isFutureIsoDate(state.wallet_api_retry_after_at, now)) {
      return { enabled: true, changed: false, reason: 'wallet_backoff' };
    }

    try {
      const referenceData = await this._ensureReferenceData();
      if (!referenceData) {
        return { enabled: true, changed: false, reason: 'wallet_reference_data_unavailable' };
      }

      const fx = await this._resolveSettlementRate(currencyState, now);
      if (!fx) {
        this.logger.warning('Wallet sync skipped because no USD/PHP rate is available');
        return { enabled: true, changed: false, reason: 'fx_unavailable' };
      }

      let changed = false;

      if (includeFundsHistory) {
        const imported = await this._importNewIncomeEntries({
          state,
          referenceData,
          payments,
          fundsHistorySnapshot,
          fx,
          now,
        });
        changed = changed || imported;
      }

      state.last_seen_available_amount_cents = normalizeCents(payments.available_amount_cents, payments.available_amount);
      state.last_seen_available_amount = normalizeMoney(payments.available_amount);
      state.updated_at = now.toISOString();
      clearWalletApiBackoff(state);
      saveWalletSyncState(this.statePath, state);

      return { enabled: true, changed };
    } catch (error) {
      applyWalletApiBackoff(state, error, now);
      if (state) {
        state.updated_at = now.toISOString();
        saveWalletSyncState(this.statePath, state);
      }
      this.logger.warning(`Wallet sync skipped: ${error.message}`);
      return { enabled: true, changed: false, error: error.message };
    }
  }

  async _ensureReferenceData() {
    if (this.referenceData) {
      return this.referenceData;
    }

    const accounts = await this.client.fetchAccounts();
    const categories = await this.client.fetchCategories();
    const dataAnnotationAccount = resolveAccountByName(accounts, this.config.wallet_data_annotation_account_name);
    const gotymeAccount = resolveAccountByName(accounts, this.config.wallet_gotyme_account_name);
    const incomeCategory = resolveCategoryByName(categories, this.config.wallet_income_category_name);
    const feeCategory = resolveCategoryByName(categories, this.config.wallet_fee_category_name);

    if (!dataAnnotationAccount || !gotymeAccount || !incomeCategory || !feeCategory) {
      const missing = [];
      if (!dataAnnotationAccount) missing.push(`account:${this.config.wallet_data_annotation_account_name}`);
      if (!gotymeAccount) missing.push(`account:${this.config.wallet_gotyme_account_name}`);
      if (!incomeCategory) missing.push(`category:${this.config.wallet_income_category_name}`);
      if (!feeCategory) missing.push(`category:${this.config.wallet_fee_category_name}`);
      throw new Error(`Wallet reference data not resolved: ${missing.join(', ')}`);
    }

    const dataAnnotationCurrency = resolveAccountCurrencyCode(dataAnnotationAccount);
    const gotymeCurrency = resolveAccountCurrencyCode(gotymeAccount);

    if (dataAnnotationCurrency !== WALLET_CURRENCY) {
      throw new Error(`Wallet account '${dataAnnotationAccount.name}' must be PHP (found: ${dataAnnotationCurrency || 'unknown'})`);
    }

    if (gotymeCurrency !== WALLET_CURRENCY) {
      throw new Error(`Wallet account '${gotymeAccount.name}' must be PHP (found: ${gotymeCurrency || 'unknown'})`);
    }

    this.referenceData = {
      dataAnnotationAccount,
      gotymeAccount,
      incomeCategory,
      feeCategory,
    };

    return this.referenceData;
  }

  async _resolveSettlementRate(currencyState, now) {
    let state = currencyState || {};
    if (!Number.isFinite(Number(state.usd_php_rate)) || shouldRefreshCurrencyRate(state, now)) {
      const fxRate = await fetchUsdToPhpRate();
      state.usd_php_rate = fxRate.rate;
      state.usd_php_rate_date = fxRate.date;
      state.usd_php_rate_fetched_at = fxRate.fetched_at;
      state.usd_php_rate_source = fxRate.source;
      saveCurrencyState('/data/currency-state.json', state);
    }

    const rate = Number(state.usd_php_rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      return null;
    }

    return {
      referenceRate: rate,
      settlementRate: roundToSix(rate * normalizeNumber(this.config.wallet_settlement_adjustment, 0.99856)),
      feeRate: normalizeNumber(this.config.wallet_paypal_fee_rate, 0.01),
      feeMaxUsd: normalizeNumber(this.config.wallet_paypal_fee_max_usd, 10.0),
    };
  }

  async recordWithdrawalSubmission({ payments, currencyState, now = new Date() }) {
    if (!this.isEnabled()) {
      return { enabled: false, changed: false };
    }

    if (!payments) {
      return { enabled: true, changed: false };
    }

    let state = loadWalletSyncState(this.statePath);
    if (isFutureIsoDate(state.wallet_api_retry_after_at, now)) {
      return { enabled: true, changed: false, reason: 'wallet_backoff' };
    }

    try {
      const referenceData = await this._ensureReferenceData();
      if (!referenceData) {
        return { enabled: true, changed: false, reason: 'wallet_reference_data_unavailable' };
      }

      const fx = await this._resolveSettlementRate(currencyState, now);
      if (!fx) {
        this.logger.warning('Wallet withdrawal skipped because no USD/PHP rate is available');
        return { enabled: true, changed: false, reason: 'fx_unavailable' };
      }

      const result = await this._createConfirmedWithdrawal({
        state,
        referenceData,
        payments,
        fx,
        now,
      });

      state.updated_at = now.toISOString();
      clearWalletApiBackoff(state);
      saveWalletSyncState(this.statePath, state);

      return { enabled: true, changed: result.changed };
    } catch (error) {
      applyWalletApiBackoff(state, error, now);
      if (state) {
        state.updated_at = now.toISOString();
        saveWalletSyncState(this.statePath, state);
      }
      this.logger.warning(`Wallet withdrawal skipped: ${error.message}`);
      return { enabled: true, changed: false, error: error.message };
    }
  }

  async _importNewIncomeEntries({ state, referenceData, fundsHistorySnapshot, fx, now }) {
    const entries = Array.isArray(fundsHistorySnapshot?.pending_payout_entries)
      ? fundsHistorySnapshot.pending_payout_entries
      : [];

    let changed = false;
    const seenFingerprintCounts = {};
    const pendingCreates = [];

    for (const entry of entries) {
      if (!entry || entry.status !== 'pending') {
        continue;
      }

      const sourceFingerprint = normalizeText(entry.fingerprint) || buildFallbackFingerprint(entry);
      if (!sourceFingerprint) {
        continue;
      }

      seenFingerprintCounts[sourceFingerprint] = (seenFingerprintCounts[sourceFingerprint] || 0) + 1;
      const marker = buildIncomeMarker(sourceFingerprint, seenFingerprintCounts[sourceFingerprint]);
      const existing = state.imported_funds_entries[marker] || null;
      if (existing?.record_id) {
        const existingRecord = await this._recoverExistingRecord({
          accountId: referenceData.dataAnnotationAccount.id,
          noteMarker: marker,
          paymentType: 'web_payment',
          categoryId: referenceData.incomeCategory.id,
        });
        if (existingRecord) {
          continue;
        }

        this.logger.warning(`Wallet income marker ${marker} was stored in sync state but no matching Wallet record was found; recreating it`);
        delete state.imported_funds_entries[marker];
        changed = true;
      }

      if (state.imported_funds_entries[marker]?.record_id) {
        continue;
      }

      const existingRecords = await this.client.findRecordsByNote({
        accountId: referenceData.dataAnnotationAccount.id,
        noteMarker: marker,
      });
      if (existingRecords.length > 0) {
        state.imported_funds_entries[marker] = {
          key: marker,
          note_marker: marker,
          source_marker: sourceFingerprint,
          record_id: existingRecords[0].id || null,
          source_type: 'income',
          source_fingerprint: sourceFingerprint,
          source_amount_usd_cents: normalizeCents(entry.amount_cents, entry.amount),
          source_amount_php_cents: null,
          source_fee_usd_cents: null,
          source_fee_php_cents: null,
          source_net_usd_cents: null,
          source_net_php_cents: null,
          source_rate: fx.referenceRate,
          created_at: now.toISOString(),
        };
        changed = true;
        continue;
      }

      const usdCents = normalizeCents(entry.amount_cents, entry.amount);
      if (usdCents <= 0) {
        continue;
      }

      const phpCents = roundToCents((usdCents / 100) * fx.settlementRate * 100);
      const recordInput = buildIncomeRecord({
        accountId: referenceData.dataAnnotationAccount.id,
        categoryId: referenceData.incomeCategory.id,
        noteMarker: marker,
        sourceFingerprint,
        entry,
        usdCents,
        phpCents,
        fx,
        now,
      });
      pendingCreates.push({
        marker,
        sourceFingerprint,
        usdCents,
        phpCents,
        recordInput,
      });
    }

    for (let index = 0; index < pendingCreates.length; index += DEFAULT_BATCH_SIZE) {
      const batch = pendingCreates.slice(index, index + DEFAULT_BATCH_SIZE);
      const createdMap = await this._createIncomeRecordBatch(batch, referenceData, fx, now, state);
      changed = changed || createdMap.changed;
    }

    if (changed) {
      saveWalletSyncState(this.statePath, state);
    }

    return changed;
  }

  async _createIncomeRecordBatch(batch, referenceData, fx, now, state) {
    if (!Array.isArray(batch) || batch.length === 0) {
      return { changed: false };
    }

    try {
      const response = await this.client.createRecords(batch.map((item) => item.recordInput), true);
      const responseStatus = Number(response?.status || response?.statusCode || 0) || null;
      const results = Array.isArray(response?.results)
        ? response.results
        : Array.isArray(response)
          ? response
          : [];

      let changed = false;
      const failures = [];
      for (let index = 0; index < batch.length; index += 1) {
        const item = batch[index];
        const result = results[index] || results[0] || {};
        if (result.success === false) {
          const recovered = await this._recoverExistingRecord({
            accountId: referenceData.dataAnnotationAccount.id,
            noteMarker: item.marker,
            paymentType: 'web_payment',
            categoryId: referenceData.incomeCategory.id,
          });
          if (!recovered) {
            failures.push(`${item.marker}: ${result.error || 'rejected'}`);
            continue;
          }

          state.imported_funds_entries[item.marker] = {
            key: item.marker,
            note_marker: item.marker,
            source_marker: item.sourceFingerprint,
            record_id: recovered.id || null,
            source_type: 'income',
            source_fingerprint: item.sourceFingerprint,
            source_amount_usd_cents: item.usdCents,
            source_amount_php_cents: item.phpCents,
            source_fee_usd_cents: null,
            source_fee_php_cents: null,
            source_net_usd_cents: null,
            source_net_php_cents: null,
            source_rate: fx.referenceRate,
            created_at: now.toISOString(),
          };
          changed = true;
          continue;
        }

        const recordId = result.id || result.record?.id || null;
        if (!recordId) {
          const recovered = await this._recoverExistingRecord({
            accountId: referenceData.dataAnnotationAccount.id,
            noteMarker: item.marker,
            paymentType: 'web_payment',
            categoryId: referenceData.incomeCategory.id,
          });
          if (recovered) {
            state.imported_funds_entries[item.marker] = {
              key: item.marker,
              note_marker: item.marker,
              source_marker: item.sourceFingerprint,
              record_id: recovered.id || null,
              source_type: 'income',
              source_fingerprint: item.sourceFingerprint,
              source_amount_usd_cents: item.usdCents,
              source_amount_php_cents: item.phpCents,
              source_fee_usd_cents: null,
              source_fee_php_cents: null,
              source_net_usd_cents: null,
              source_net_php_cents: null,
              source_rate: fx.referenceRate,
              created_at: now.toISOString(),
            };
            changed = true;
            continue;
          }

          failures.push(`${item.marker}: missing record id${responseStatus ? ` (status ${responseStatus})` : ''}`);
          continue;
        }

        state.imported_funds_entries[item.marker] = {
          key: item.marker,
          note_marker: item.marker,
          source_marker: item.sourceFingerprint,
          record_id: recordId,
          source_type: 'income',
          source_fingerprint: item.sourceFingerprint,
          source_amount_usd_cents: item.usdCents,
          source_amount_php_cents: item.phpCents,
          source_fee_usd_cents: null,
          source_fee_php_cents: null,
          source_net_usd_cents: null,
          source_net_php_cents: null,
          source_rate: fx.referenceRate,
          created_at: now.toISOString(),
        };
        changed = true;
      }

      if (failures.length > 0) {
        saveWalletSyncState(this.statePath, state);
        const error = new Error(`Wallet income batch incomplete: ${failures.join('; ')}`);
        error.partialBatch = true;
        throw error;
      }

      return { changed };
    } catch (error) {
      if (error?.partialBatch) {
        throw error;
      }

      this.logger.warning(`Wallet income batch create failed: ${error.message}`);
      let changed = false;
      for (const item of batch) {
        const created = await this._createLedgerRecord(item.recordInput, {
          accountId: referenceData.dataAnnotationAccount.id,
          noteMarker: item.marker,
          paymentType: 'web_payment',
          categoryId: referenceData.incomeCategory.id,
        });

        if (!created?.recordId) {
          continue;
        }

        state.imported_funds_entries[item.marker] = {
          key: item.marker,
          note_marker: item.marker,
          source_marker: item.sourceFingerprint,
          record_id: created.recordId,
          source_type: 'income',
          source_fingerprint: item.sourceFingerprint,
          source_amount_usd_cents: item.usdCents,
          source_amount_php_cents: item.phpCents,
          source_fee_usd_cents: null,
          source_fee_php_cents: null,
          source_net_usd_cents: null,
          source_net_php_cents: null,
          source_rate: fx.referenceRate,
          created_at: now.toISOString(),
        };
        changed = true;
      }

      return { changed };
    }
  }

  async _createConfirmedWithdrawal({ state, referenceData, payments, fx, now }) {
    const payoutAt = normalizeIsoDate(payments.last_payout_at) || now.toISOString();
    const grossUsdCents = positiveCents(payments.last_payout_amount_cents, payments.last_payout_amount);
    if (grossUsdCents <= 0) {
      return { changed: false };
    }

    const withdrawalMarker = buildWithdrawalMarker({
      payoutAt,
      grossUsdCents,
    });
    const withdrawalState = state.withdrawal_events[withdrawalMarker] || normalizeWithdrawalState(withdrawalMarker);
    if (withdrawalState.fee_record_id && withdrawalState.transfer_record_id) {
      return { changed: false };
    }

    const feeUsdCents = calculatePaypalFeeCents(grossUsdCents, fx);
    const netUsdCents = Math.max(0, grossUsdCents - feeUsdCents);
    const grossPhpCents = roundToCents((grossUsdCents / 100) * fx.settlementRate * 100);
    const feePhpCents = roundToCents((feeUsdCents / 100) * fx.settlementRate * 100);
    const netPhpCents = Math.max(0, grossPhpCents - feePhpCents);

    const commonContext = {
      payoutAt,
      grossUsdCents,
      feeUsdCents,
      netUsdCents,
      grossPhpCents,
      feePhpCents,
      netPhpCents,
      fx,
      now,
      withdrawalMarker,
    };

    const feeMarker = `${withdrawalMarker}:fee`;
    const transferMarker = `${withdrawalMarker}:transfer`;

    const feeRecord = await this._createWithdrawalFeeRecord({
      ...commonContext,
      marker: feeMarker,
      referenceData,
    }, state, referenceData);

    if (feeRecord?.recordId) {
      withdrawalState.fee_record_id = feeRecord.recordId;
      withdrawalState.record_id = feeRecord.recordId;
      withdrawalState.last_attempt_at = now.toISOString();
      withdrawalState.attempt_count = (withdrawalState.attempt_count || 0) + 1;
      state.withdrawal_events[withdrawalMarker] = withdrawalState;
      saveWalletSyncState(this.statePath, state);
    }

    const transferRecord = await this._createWithdrawalTransferRecord({
      ...commonContext,
      marker: transferMarker,
      referenceData,
    }, state, referenceData);

    if (transferRecord?.recordId) {
      withdrawalState.transfer_record_id = transferRecord.recordId;
      withdrawalState.mirror_record_id = transferRecord.recordId;
      withdrawalState.last_attempt_at = now.toISOString();
      withdrawalState.attempt_count = (withdrawalState.attempt_count || 0) + 1;
      state.withdrawal_events[withdrawalMarker] = withdrawalState;
      saveWalletSyncState(this.statePath, state);
    }

    if (withdrawalState.fee_record_id && withdrawalState.transfer_record_id) {
      state.withdrawal_events[withdrawalMarker] = {
        ...withdrawalState,
        key: withdrawalMarker,
        note_marker: withdrawalMarker,
        source_marker: withdrawalMarker,
        source_type: 'withdrawal',
        source_amount_usd_cents: grossUsdCents,
        source_amount_php_cents: grossPhpCents,
        source_fee_usd_cents: feeUsdCents,
        source_fee_php_cents: feePhpCents,
        source_net_usd_cents: netUsdCents,
        source_net_php_cents: netPhpCents,
        source_rate: fx.referenceRate,
        created_at: withdrawalState.created_at || now.toISOString(),
        completed_at: now.toISOString(),
      };
      state.last_seen_last_payout_at = payoutAt;
      state.first_sync_completed_at = state.first_sync_completed_at || now.toISOString();
      saveWalletSyncState(this.statePath, state);
      return { changed: true };
    }

    withdrawalState.key = withdrawalMarker;
    withdrawalState.note_marker = withdrawalMarker;
    withdrawalState.source_marker = withdrawalMarker;
    withdrawalState.source_type = 'withdrawal';
    withdrawalState.source_amount_usd_cents = grossUsdCents;
    withdrawalState.source_amount_php_cents = grossPhpCents;
    withdrawalState.source_fee_usd_cents = feeUsdCents;
    withdrawalState.source_fee_php_cents = feePhpCents;
    withdrawalState.source_net_usd_cents = netUsdCents;
    withdrawalState.source_net_php_cents = netPhpCents;
    withdrawalState.source_rate = fx.referenceRate;
    withdrawalState.created_at = withdrawalState.created_at || now.toISOString();
    withdrawalState.last_attempt_at = now.toISOString();
    withdrawalState.attempt_count = (withdrawalState.attempt_count || 0) + 1;
    state.withdrawal_events[withdrawalMarker] = withdrawalState;
    saveWalletSyncState(this.statePath, state);

    return { changed: Boolean(feeRecord?.recordId || transferRecord?.recordId) };
  }

  async _processWithdrawalIfNeeded() {
    return false;
  }

  async _createWithdrawalFeeRecord(context, state, referenceData) {
    const existing = state.withdrawal_events[context.withdrawalMarker];
    if (existing?.fee_record_id) {
      return { recordId: existing.fee_record_id };
    }

    const existingRecords = await this.client.findRecordsByNote({
      accountId: referenceData.dataAnnotationAccount.id,
      noteMarker: context.marker,
      paymentType: 'transfer',
      categoryId: referenceData.feeCategory.id,
    });
    if (existingRecords.length > 0) {
      return { recordId: existingRecords[0].id || null };
    }

    const record = buildWithdrawalFeeRecord({
      accountId: referenceData.dataAnnotationAccount.id,
      categoryId: referenceData.feeCategory.id,
      marker: context.marker,
      ...context,
    });

    return this._createLedgerRecord(record, {
      accountId: referenceData.dataAnnotationAccount.id,
      noteMarker: context.marker,
      paymentType: 'transfer',
    });
  }

  async _createWithdrawalTransferRecord(context, state, referenceData) {
    const existing = state.withdrawal_events[context.withdrawalMarker];
    if (existing?.transfer_record_id) {
      return { recordId: existing.transfer_record_id };
    }

    const existingRecords = await this.client.findRecordsByNote({
      accountId: referenceData.dataAnnotationAccount.id,
      noteMarker: context.marker,
      paymentType: 'transfer',
    });
    if (existingRecords.length > 0) {
      return { recordId: existingRecords[0].id || null };
    }

    const record = buildWithdrawalTransferRecord({
      accountId: referenceData.dataAnnotationAccount.id,
      targetAccountId: referenceData.gotymeAccount.id,
      marker: context.marker,
      ...context,
    });

    return this._createLedgerRecord(record, {
      accountId: referenceData.dataAnnotationAccount.id,
      noteMarker: context.marker,
      paymentType: 'transfer',
    });
  }

  async _createLedgerRecord(record, searchOptions) {
    const marker = searchOptions.noteMarker;
    try {
      const response = await this.client.createRecords([record], true);
      const responseStatus = Number(response?.status || response?.statusCode || 0) || null;
      const result = Array.isArray(response?.results) ? response.results[0] || {} : {};

      if (result.success === false) {
        const recovered = await this._recoverExistingRecord(searchOptions);
        if (recovered) {
          return { recordId: recovered.id || null, recovered: true };
        }

        throw new Error(`Wallet record rejected: ${result.error || 'unknown error'}`);
      }

      const recordId = result.id || result.record?.id || null;
      if (!recordId) {
        const recovered = await this._recoverExistingRecord(searchOptions);
        if (recovered) {
          return { recordId: recovered.id || null, recovered: true };
        }

        throw new Error(`Wallet record create returned no id${responseStatus ? ` (status ${responseStatus})` : ''}`);
      }

      return {
        recordId,
        record: result.record || null,
      };
    } catch (error) {
      const recovered = await this._recoverExistingRecord(searchOptions);
      if (recovered) {
        return { recordId: recovered.id || null, recovered: true };
      }

      this.logger.warning(`Wallet record create failed for ${marker}: ${error.message}`);
      return null;
    }
  }

  async _recoverExistingRecord({ accountId, noteMarker, paymentType = null, categoryId = null }) {
    const records = await this.client.findRecordsByNote({ accountId, noteMarker, paymentType, categoryId });
    return records.length > 0 ? records[0] : null;
  }

  async _processWithdrawalFeeRecord(context, state, referenceData) {
    return this._createWithdrawalFeeRecord(context, state, referenceData);
  }
}

function buildIncomeRecord({ accountId, categoryId, noteMarker, sourceFingerprint, entry, usdCents, phpCents, fx, now }) {
  const usdAmount = usdCents / 100;
  const phpAmount = phpCents / 100;
  const note = buildIncomeNote({
    noteMarker,
    sourceFingerprint,
    usdAmount,
    phpAmount,
    fx,
    entry,
  });

  return {
    accountId,
    categoryId,
    amount: { value: phpAmount, currencyCode: WALLET_CURRENCY },
    recordDate: normalizeIsoDate(entry.first_seen_at) || now.toISOString(),
    paymentType: 'web_payment',
    recordState: 'cleared',
    note,
    counterParty: 'Data Annotation',
  };
}

function buildWithdrawalFeeRecord({ accountId, categoryId, marker, payoutAt, grossUsdCents, feeUsdCents, grossPhpCents, feePhpCents, fx, now }) {
  return {
    accountId,
    categoryId,
    amount: { value: -(feePhpCents / 100), currencyCode: WALLET_CURRENCY },
    recordDate: payoutAt || now.toISOString(),
    paymentType: 'transfer',
    recordState: 'cleared',
    note: buildWithdrawalNote({
      marker,
      kind: 'fee',
      grossUsdCents,
      feeUsdCents,
      grossPhpCents,
      phpCents: feePhpCents,
      netUsdCents: grossUsdCents - feeUsdCents,
      netPhpCents: grossPhpCents - feePhpCents,
      fx,
    }),
    counterParty: 'PayPal',
  };
}

function buildWithdrawalTransferRecord({ accountId, targetAccountId, marker, payoutAt, grossUsdCents, feeUsdCents, netUsdCents, grossPhpCents, feePhpCents, netPhpCents, fx, now }) {
  return {
    accountId,
    amount: { value: -(netPhpCents / 100), currencyCode: WALLET_CURRENCY },
    recordDate: payoutAt || now.toISOString(),
    paymentType: 'transfer',
    recordState: 'cleared',
    note: buildWithdrawalNote({
      marker,
      kind: 'transfer',
      grossUsdCents,
      feeUsdCents,
      grossPhpCents,
      phpCents: netPhpCents,
      netUsdCents,
      netPhpCents,
      fx,
    }),
    counterParty: 'GoTyme',
    transfer: {
      pairingMode: 'new',
      accountId: targetAccountId,
    },
  };
}

function buildIncomeNote({ noteMarker, sourceFingerprint, usdAmount, phpAmount, fx, entry }) {
  const project = truncateText(String(entry?.project || 'DataAnnotation'), 40);
  const amount = formatPhp(phpAmount);
  const rate = formatRate(fx.settlementRate);
  const value = [`${NOTE_PREFIX}|income|${noteMarker}`, `proj=${project}`, `usd=${formatUsd(usdAmount)}`, `php=${amount}`, `rate=${rate}`];
  if (sourceFingerprint) {
    value.push(`src=${truncateText(sourceFingerprint, 24)}`);
  }
  return truncateText(value.join(' '), 255);
}

function buildWithdrawalNote({ marker, kind, grossUsdCents, feeUsdCents, grossPhpCents, phpCents, netUsdCents, netPhpCents, fx }) {
  return truncateText(
    [
      `${NOTE_PREFIX}|withdrawal|${kind}|${marker}`,
      `gross=${formatUsd(grossUsdCents / 100)}`,
      `fee=${formatUsd(feeUsdCents / 100)}`,
      `net=${formatUsd(netUsdCents / 100)}`,
      `php=${formatPhp(phpCents)}`,
      `rate=${formatRate(fx.settlementRate)}`,
    ].join(' '),
    255
  );
}

function buildWithdrawalMarker({ payoutAt, grossUsdCents }) {
  const raw = [payoutAt || '', String(grossUsdCents || 0)].join('|');
  return `${NOTE_PREFIX}|wd|${hashText(raw)}`;
}

function buildIncomeMarker(sourceFingerprint, occurrence = 1) {
  return `${NOTE_PREFIX}|inc|${hashText(sourceFingerprint)}#${Math.max(1, Math.trunc(Number(occurrence) || 1))}`;
}

function buildFallbackFingerprint(entry) {
  return [
    normalizeText(entry?.entry_date),
    normalizeText(entry?.project),
    normalizeText(entry?.kind),
    normalizeText(entry?.amount),
    normalizeText(entry?.duration),
  ].join('|');
}

function countImportedEntriesForFingerprint(state, sourceFingerprint) {
  const target = normalizeText(sourceFingerprint);
  return Object.values(state?.imported_funds_entries || {}).reduce((count, entry) => {
    return count + (normalizeText(entry?.source_fingerprint) === target ? 1 : 0);
  }, 0);
}

function normalizeWithdrawalState(withdrawalMarker) {
  return {
    key: withdrawalMarker,
    note_marker: withdrawalMarker,
    source_marker: withdrawalMarker,
    fee_record_id: null,
    transfer_record_id: null,
    record_id: null,
    mirror_record_id: null,
    source_type: 'withdrawal',
    source_amount_usd_cents: null,
    source_amount_php_cents: null,
    source_fee_usd_cents: null,
    source_fee_php_cents: null,
    source_net_usd_cents: null,
    source_net_php_cents: null,
    source_rate: null,
    created_at: null,
    completed_at: null,
    last_attempt_at: null,
    attempt_count: 0,
    last_error: null,
  };
}

function applyWalletApiBackoff(state, error, now) {
  if (!state || !error) {
    return;
  }

  const retryAfterSeconds = Number(error.retryAfterSeconds || error.details?.retryAfterSeconds);
  const failureCount = Math.max(1, (Number(state.wallet_api_failure_count) || 0) + 1);
  const baseDelayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
    ? retryAfterSeconds * 1000
    : Math.min(60 * 60 * 1000, 15_000 * (2 ** Math.min(6, failureCount - 1)));
  const backoffMs = Math.max(15_000, baseDelayMs);

  state.wallet_api_failure_count = failureCount;
  state.wallet_api_retry_after_at = new Date(now.getTime() + backoffMs).toISOString();
  state.wallet_api_last_error = truncateText(String(error.message || 'wallet api error'), 255);
}

function clearWalletApiBackoff(state) {
  if (!state) {
    return;
  }

  state.wallet_api_failure_count = 0;
  state.wallet_api_retry_after_at = null;
  state.wallet_api_last_error = null;
}

function isFutureIsoDate(value, now = new Date()) {
  const date = normalizeDate(value);
  return Boolean(date && date > now);
}

function hashText(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function calculatePaypalFeeCents(grossUsdCents, fx) {
  const grossUsd = grossUsdCents / 100;
  const feeUsd = Math.min(grossUsd * fx.feeRate, fx.feeMaxUsd);
  return Math.min(grossUsdCents, roundToCents(feeUsd * 100));
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function normalizeIsoDate(value) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCents(centsValue, amountValue) {
  const cents = Number(centsValue);
  if (Number.isFinite(cents)) {
    return Math.round(cents);
  }

  const amount = Number(amountValue);
  if (Number.isFinite(amount)) {
    return Math.round(amount * 100);
  }

  return null;
}

function normalizeMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function positiveCents(centsValue, amountValue) {
  const cents = normalizeCents(centsValue, amountValue);
  return Number.isFinite(cents) && cents > 0 ? cents : 0;
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundToCents(value) {
  return Math.round(Number(value) || 0);
}

function roundToSix(value) {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

function formatUsd(value) {
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)}`;
}

function formatPhp(value) {
  return `PHP ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)}`;
}

function formatRate(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(Number(value) || 0);
}

function truncateText(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

function resolveAccountByName(accounts, name) {
  const target = normalizeText(name).toLowerCase();
  const matches = Array.isArray(accounts)
    ? accounts.filter((account) => normalizeText(account?.name).toLowerCase() === target)
    : [];

  if (matches.length !== 1) {
    return null;
  }

  return matches[0];
}

function resolveCategoryByName(categories, name) {
  const target = normalizeText(name).toLowerCase();
  const matches = Array.isArray(categories)
    ? categories.filter((category) => normalizeText(category?.name).toLowerCase() === target && category?.archived !== true)
    : [];

  if (matches.length !== 1) {
    return null;
  }

  return matches[0];
}

function resolveAccountCurrencyCode(account) {
  const candidate = account?.currencyCode
    || account?.currency
    || account?.baseCurrency
    || account?.initialBalance?.currencyCode
    || account?.balance?.currencyCode
    || account?.currency?.code
    || account?.currency?.currencyCode
    || account?.currency?.isoCode
    || account?.currency?.currency_code
    || account?.currency?.shortCode
    || account?.currency?.name
    || account?.baseCurrency?.code
    || account?.baseCurrency?.currencyCode
    || account?.baseCurrency?.isoCode
    || account?.baseCurrency?.currency_code
    || account?.baseCurrency?.shortCode
    || account?.baseCurrency?.name;

  return normalizeText(candidate).toUpperCase();
}

module.exports = {
  WalletSync,
  buildIncomeMarker,
  buildWithdrawalMarker,
  calculatePaypalFeeCents,
  formatPhp,
  formatRate,
  formatUsd,
};
