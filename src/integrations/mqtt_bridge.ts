// @ts-nocheck
// @ts-nocheck
const NULL_LOGGER = {
  debug() {},
  info() {},
  warning() {},
  error() {},
};

const { formatClaimProjectEntityName } = require('../projects/project_claim.ts');
const { buildDeviceInfo, buildDiscoveryNames, formatProjectEntityName, shortenProjectName, slugify } = require('./mqtt_discovery.ts');
const { buildTopicHelpers } = require('./mqtt_topics.ts');

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

class DataAnnotationMqttBridge {
  constructor(options) {
    const mqtt = require('mqtt');
    this.topicPrefix = options.topicPrefix;
    this.topics = buildTopicHelpers(this.topicPrefix);
    this.profileName = options.profileName;
    this.version = options.version;
    this.logger = options.logger || NULL_LOGGER;
    this.scanRequested = { value: false };
    this.withdrawRequested = { value: false };
    this.withdrawLockChange = { value: null };
    this.claimProjectsLockChange = { value: null };
    this.fastPollingChange = { value: null };
    this.autoAcceptChange = { value: null };
    this.currencyModeChange = { value: null };
    this.rebuildDiscoveryRequested = { value: false };
    this.claimRequested = { value: null };
    this.publishedProjectSlugs = new Set();
    this.publishedClaimProjectSlugs = new Set();
    this.connected = false;
    this._availabilityState = 'offline';
    this.client = mqtt.connect({
      host: options.host,
      port: options.port,
      username: options.username,
      password: options.password,
      protocol: 'mqtt',
      reconnectPeriod: 5000,
      clientId: `${this.topicPrefix}_${slugify(this.profileName)}`,
      will: {
        topic: this._topic('availability'),
        payload: 'offline',
        retain: true,
        qos: 1,
      },
    });

    this.device = buildDeviceInfo(this.profileName, this.version);

    this.client.on('connect', () => {
      this.connected = true;
      this.logger.info('Connected to MQTT broker');
      this.client.subscribe(
        [this._topic('command/sync'), this._topic('command/withdraw'), this._topic('command/rebuild_discovery'), this._topic('withdraw/lock/set'), this._topic('fast/poll/set'), this._topic('claim/lock/set'), this._topic('auto_accept/set'), this._topic('currency/mode/set'), this._topic('claim/+')],
        { qos: 1 }
      );
      this.logger.debug(`Subscribed to ${this._topic('command/sync')}`);
      this.logger.debug(`Subscribed to ${this._topic('command/withdraw')}`);
      this.logger.debug(`Subscribed to ${this._topic('command/rebuild_discovery')}`);
      this.logger.debug(`Subscribed to ${this._topic('withdraw/lock/set')}`);
      this.logger.debug(`Subscribed to ${this._topic('fast/poll/set')}`);
      this.logger.debug(`Subscribed to ${this._topic('claim/lock/set')}`);
      this.logger.debug(`Subscribed to ${this._topic('auto_accept/set')}`);
      this.logger.debug(`Subscribed to ${this._topic('currency/mode/set')}`);
      this.logger.debug(`Subscribed to ${this._topic('claim/+')}`);
    });
    this.client.on('close', () => {
      this.connected = false;
      this.logger.warning('MQTT connection closed');
    });
    this.client.on('error', (error) => {
      this.logger.warning(`MQTT error: ${error.message}`);
    });
    this.client.on('message', (topic, payload) => {
      const message = String(payload || '').trim().toLowerCase();
      if (topic === this._topic('command/sync') && message === 'now') {
        this.logger.info('Received manual sync request via MQTT');
        this.scanRequested.value = true;
      } else if (topic === this._topic('command/withdraw') && message === 'withdraw') {
        this.logger.info('Received withdraw request via MQTT');
        this.withdrawRequested.value = true;
      } else if (topic === this._topic('command/rebuild_discovery') && message === 'rebuild') {
        this.logger.info('Received discovery rebuild request via MQTT');
        this.rebuildDiscoveryRequested.value = true;
      } else if (topic === this._topic('withdraw/lock/set') && message === 'on') {
        this.logger.info('Received withdraw lock request: ON');
        this.withdrawLockChange.value = true;
        this.logger.debug('Publishing optimistic withdraw lock state: ON');
        this.publishWithdrawLockState(true);
      } else if (topic === this._topic('withdraw/lock/set') && message === 'off') {
        this.logger.info('Received withdraw lock request: OFF');
        this.withdrawLockChange.value = false;
        this.logger.debug('Publishing optimistic withdraw lock state: OFF');
        this.publishWithdrawLockState(false);
      } else if (topic === this._topic('fast/poll/set') && message === 'on') {
        this.logger.info('Received fast polling request: ON');
        this.fastPollingChange.value = true;
        this.logger.debug('Publishing optimistic fast polling state: ON');
        this.publishFastPollingState(true);
      } else if (topic === this._topic('fast/poll/set') && message === 'off') {
        this.logger.info('Received fast polling request: OFF');
        this.fastPollingChange.value = false;
        this.logger.debug('Publishing optimistic fast polling state: OFF');
        this.publishFastPollingState(false);
      } else if (topic === this._topic('claim/lock/set') && message === 'on') {
        this.logger.info('Received claim projects lock request: ON');
        this.claimProjectsLockChange.value = true;
        this.logger.debug('Publishing optimistic claim projects lock state: ON');
        this.publishClaimProjectsLockState(true);
      } else if (topic === this._topic('claim/lock/set') && message === 'off') {
        this.logger.info('Received claim projects lock request: OFF');
        this.claimProjectsLockChange.value = false;
        this.logger.debug('Publishing optimistic claim projects lock state: OFF');
        this.publishClaimProjectsLockState(false);
      } else if (topic === this._topic('auto_accept/set') && message === 'on') {
        this.logger.info('Received auto accept request: ON');
        this.autoAcceptChange.value = true;
        this.logger.debug('Publishing optimistic auto accept state: ON');
        this.publishAutoAcceptState(true);
      } else if (topic === this._topic('auto_accept/set') && message === 'off') {
        this.logger.info('Received auto accept request: OFF');
        this.autoAcceptChange.value = false;
        this.logger.debug('Publishing optimistic auto accept state: OFF');
        this.publishAutoAcceptState(false);
      } else if (topic === this._topic('currency/mode/set') && message === 'on') {
        this.logger.info('Received currency mode request: PHP');
        this.currencyModeChange.value = true;
        this.logger.debug('Publishing optimistic currency mode state: PHP');
        this.publishCurrencyModeState(true);
      } else if (topic === this._topic('currency/mode/set') && message === 'off') {
        this.logger.info('Received currency mode request: USD');
        this.currencyModeChange.value = false;
        this.logger.debug('Publishing optimistic currency mode state: USD');
        this.publishCurrencyModeState(false);
      } else if (topic.startsWith(this._topic('claim/')) && topic !== this._topic('claim/lock/set') && message === 'claim') {
        const slug = topic.slice(this._topic('claim/').length);
        if (slug) {
          this.logger.info(`Received claim project request via MQTT for ${slug}`);
          this.claimRequested.value = { slug };
        }
      }
    });
  }

  async waitForConnection(timeoutMs = 10000) {
    if (this.connected) {
      return true;
    }

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MQTT connection timeout')), timeoutMs);
      this.client.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      this.client.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    return true;
  }

  publishDiscovery({ currencyUnit = 'USD' } = {}) {
    const names = buildDiscoveryNames();
    this.logger.debug('Publishing MQTT discovery payloads');

    this._publishDiscovery('button', 'sync_now', {
      name: names.button,
      unique_id: `${this.topicPrefix}_sync_now`,
      command_topic: this._topic('command/sync'),
      payload_press: 'now',
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:refresh',
      device: this.device,
    });

    this._publishDiscovery('button', 'rebuild_discovery', {
      name: 'Rebuild Discovery',
      unique_id: `${this.topicPrefix}_rebuild_discovery`,
      entity_category: 'config',
      command_topic: this._topic('command/rebuild_discovery'),
      payload_press: 'rebuild',
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:database-refresh',
      device: this.device,
    });

    this._publishDiscovery('switch', 'withdraw_locked', {
      name: names.withdraw_locked,
      unique_id: `${this.topicPrefix}_withdraw_locked`,
      entity_category: 'config',
      state_topic: this._topic('withdraw/lock/state'),
      command_topic: this._topic('withdraw/lock/set'),
      payload_on: 'ON',
      payload_off: 'OFF',
      state_on: 'ON',
      state_off: 'OFF',
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:lock',
      device: this.device,
    });

    this._publishDiscovery('switch', 'claim_projects_locked', {
      name: names.claim_projects_locked,
      unique_id: `${this.topicPrefix}_claim_projects_locked`,
      entity_category: 'config',
      state_topic: this._topic('claim/lock/state'),
      command_topic: this._topic('claim/lock/set'),
      payload_on: 'ON',
      payload_off: 'OFF',
      state_on: 'ON',
      state_off: 'OFF',
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:briefcase-lock',
      device: this.device,
    });

    this._publishDiscovery('switch', 'fast_polling', {
      name: names.fast_polling,
      unique_id: `${this.topicPrefix}_fast_polling`,
      entity_category: 'config',
      state_topic: this._topic('fast/poll/state'),
      command_topic: this._topic('fast/poll/set'),
      payload_on: 'ON',
      payload_off: 'OFF',
      state_on: 'ON',
      state_off: 'OFF',
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:flash',
      device: this.device,
    });

    this._publishDiscovery('switch', 'currency_mode', {
      name: names.currency_mode,
      unique_id: `${this.topicPrefix}_currency_mode`,
      entity_category: 'config',
      state_topic: this._topic('currency/mode/state'),
      command_topic: this._topic('currency/mode/set'),
      payload_on: 'ON',
      payload_off: 'OFF',
      state_on: 'ON',
      state_off: 'OFF',
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:currency-php',
      device: this.device,
    });

    this._publishDiscovery('switch', 'auto_accept', {
      name: names.auto_accept,
      unique_id: `${this.topicPrefix}_auto_accept`,
      entity_category: 'config',
      state_topic: this._topic('auto_accept/state'),
      command_topic: this._topic('auto_accept/set'),
      payload_on: 'ON',
      payload_off: 'OFF',
      state_on: 'ON',
      state_off: 'OFF',
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:robot',
      device: this.device,
    });

    this._publishDiscovery('button', 'withdraw_funds', {
      name: names.withdraw_funds,
      unique_id: `${this.topicPrefix}_withdraw_funds`,
      command_topic: this._topic('command/withdraw'),
      payload_press: 'withdraw',
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:cash-sync',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'profile_name', {
      name: names.profile,
      unique_id: `${this.topicPrefix}_profile_name`,
      entity_category: 'diagnostic',
      state_topic: this._topic('profile/state'),
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:account',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'project_count', {
      name: names.project_count,
      unique_id: `${this.topicPrefix}_project_count`,
      state_topic: this._topic('projects/summary'),
      value_template: '{{ value_json.count }}',
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:counter',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'total_tasks', {
      name: names.total_tasks,
      unique_id: `${this.topicPrefix}_total_tasks`,
      state_topic: this._topic('projects/summary'),
      value_template: '{{ value_json.total_tasks }}',
      json_attributes_topic: this._topic('projects/summary'),
      json_attributes_template:
        "{{ {'excluded_project_count': value_json.excluded_project_count, 'excluded_project_names': value_json.excluded_project_names, 'new_task_detected': value_json.new_task_detected, 'new_task_count': value_json.new_task_count, 'new_task_project_name': value_json.new_task_project_name, 'new_task_project_url': value_json.new_task_project_url, 'new_task_detected_at': value_json.new_task_detected_at, 'new_tasks': value_json.new_tasks} | tojson }}",
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      unit_of_measurement: 'tasks',
      icon: 'mdi:counter-plus',
      device: this.device,
    });

    this._publishDiscovery('binary_sensor', 'in_progress_task', {
      name: names.in_progress_task,
      unique_id: `${this.topicPrefix}_in_progress_task`,
      state_topic: this._topic('tasks/status'),
      value_template: "{{ 'ON' if value_json.in_progress_task else 'OFF' }}",
      json_attributes_topic: this._topic('tasks/status'),
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:briefcase-clock',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'available_funds', {
      name: 'Available Funds',
      unique_id: `${this.topicPrefix}_available_funds`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.available_amount }}',
      unit_of_measurement: currencyUnit,
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:cash',
      device: this.device,
    });

    this._publishDiscovery('binary_sensor', 'can_withdraw', {
      name: 'Can Withdraw',
      unique_id: `${this.topicPrefix}_can_withdraw`,
      state_topic: this._topic('payments/summary'),
      value_template: "{{ 'ON' if value_json.can_withdraw else 'OFF' }}",
      payload_on: 'ON',
      payload_off: 'OFF',
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:cash-check',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'next_withdrawal', {
      name: 'Next Withdrawal',
      unique_id: `${this.topicPrefix}_next_withdrawal`,
      state_topic: this._topic('payments/summary'),
      value_template: "{{ value_json.next_withdrawal_at if value_json.next_withdrawal_at else 'unknown' }}",
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      device_class: 'timestamp',
      icon: 'mdi:calendar-clock',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'next_payout', {
      name: names.next_payout,
      unique_id: `${this.topicPrefix}_next_payout`,
      state_topic: this._topic('payments/summary'),
      value_template: "{{ value_json.next_payout_at if value_json.next_payout_at else 'unknown' }}",
      json_attributes_topic: this._topic('payments/summary'),
      json_attributes_template:
        "{{ {'next_payout_at_human': value_json.next_payout_at_human, 'next_payout_entries': value_json.next_payout_entries, 'next_payout_entries_count': value_json.next_payout_entries_count, 'next_payout_amount': value_json.next_payout_amount, 'next_payout_source': value_json.next_payout_source, 'next_payout_confidence': value_json.next_payout_confidence} | tojson }}",
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      device_class: 'timestamp',
      icon: 'mdi:calendar-arrow-right',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'total_earnings', {
      name: 'Total Earnings',
      unique_id: `${this.topicPrefix}_total_earnings`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.total_earnings }}',
      unit_of_measurement: currencyUnit,
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:wallet',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'total_paid_out', {
      name: 'Total Paid Out',
      unique_id: `${this.topicPrefix}_total_paid_out`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.total_paid_out }}',
      unit_of_measurement: currencyUnit,
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:cash-multiple',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'this_month', {
      name: 'This Month',
      unique_id: `${this.topicPrefix}_this_month`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.this_month }}',
      unit_of_measurement: currencyUnit,
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:calendar-month',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'best_month', {
      name: 'Best Month',
      unique_id: `${this.topicPrefix}_best_month`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.best_month }}',
      unit_of_measurement: currencyUnit,
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:trophy',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'pending_approval', {
      name: 'Pending Approval',
      unique_id: `${this.topicPrefix}_pending_approval`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.pending_approval }}',
      json_attributes_topic: this._topic('payments/summary'),
      unit_of_measurement: currencyUnit,
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:progress-clock',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'last_payout', {
      name: 'Last Payout',
      unique_id: `${this.topicPrefix}_last_payout`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.last_payout_at if value_json.last_payout_at else "unknown" }}',
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      device_class: 'timestamp',
      icon: 'mdi:cash-check',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'usd_php_rate', {
      name: names.usd_php_rate,
      unique_id: `${this.topicPrefix}_usd_php_rate`,
      entity_category: 'diagnostic',
      state_topic: this._topic('currency/rate'),
      value_template: '{{ value_json.rate }}',
      json_attributes_topic: this._topic('currency/rate'),
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      unit_of_measurement: 'PHP/USD',
      state_class: 'measurement',
      icon: 'mdi:cash-sync',
      device: this.device,
    });
  }

  rebuildDiscovery({ currencyUnit = 'USD' } = {}) {
    this.logger.info('Rebuilding MQTT discovery payloads');
    [
      ['button', 'sync_now'],
      ['button', 'rebuild_discovery'],
      ['switch', 'withdraw_locked'],
      ['switch', 'claim_projects_locked'],
      ['switch', 'fast_polling'],
      ['switch', 'currency_mode'],
      ['switch', 'auto_accept'],
      ['button', 'withdraw_funds'],
      ['sensor', 'profile_name'],
      ['sensor', 'project_count'],
      ['sensor', 'total_tasks'],
      ['binary_sensor', 'in_progress_task'],
      ['sensor', 'available_funds'],
      ['binary_sensor', 'can_withdraw'],
      ['sensor', 'next_withdrawal'],
      ['sensor', 'next_payout'],
      ['sensor', 'total_earnings'],
      ['sensor', 'total_paid_out'],
      ['sensor', 'this_month'],
      ['sensor', 'best_month'],
      ['sensor', 'pending_approval'],
      ['sensor', 'last_payout'],
      ['sensor', 'usd_php_rate'],
    ].forEach(([component, objectId]) => this._publish(`homeassistant/${component}/${this.topicPrefix}_${objectId}/config`, '', true));

    this.publishDiscovery({ currencyUnit });
  }

  publishOnline() {
    this._availabilityState = 'online';
    this._publish(this._topic('availability'), 'online', true);
  }

  publishOffline() {
    this._availabilityState = 'offline';
    this._publish(this._topic('availability'), 'offline', true);
  }

  publishProfile(profileName) {
    this.logger.debug(`Publishing profile name: ${profileName || ''}`);
    this._publish(this._topic('profile/state'), profileName || '', true);
  }

  publishWithdrawLockState(locked) {
    const state = locked ? 'ON' : 'OFF';
    this.logger.debug(`Publishing withdraw lock state: ${state}`);
    this._publish(this._topic('withdraw/lock/state'), state, true);
  }

  publishClaimProjectsLockState(locked) {
    const state = locked ? 'ON' : 'OFF';
    this.logger.debug(`Publishing claim projects lock state: ${state}`);
    this._publish(this._topic('claim/lock/state'), state, true);
  }

  publishFastPollingState(enabled) {
    const state = enabled ? 'ON' : 'OFF';
    this.logger.debug(`Publishing fast polling state: ${state}`);
    this._publish(this._topic('fast/poll/state'), state, true);
  }

  publishAutoAcceptState(enabled) {
    const state = enabled ? 'ON' : 'OFF';
    this.logger.debug(`Publishing auto accept state: ${state}`);
    this._publish(this._topic('auto_accept/state'), state, true);
  }

  publishCurrencyModeState(enabled) {
    const state = enabled ? 'ON' : 'OFF';
    this.logger.debug(`Publishing currency mode state: ${state}`);
    this._publish(this._topic('currency/mode/state'), state, true);
  }

  publishCurrencyRate(rateState, scrapedAt = new Date().toISOString()) {
    const payload = { ...(rateState || {}), scraped_at: rateState?.scraped_at || scrapedAt };
    this.logger.debug(`Publishing currency rate: ${payload.rate || 'unknown'}`);
    this._publishJson(this._topic('currency/rate'), payload, true);
  }

  publishSummary(summary) {
    this.logger.debug(`Publishing project summary: ${summary.count} projects, ${summary.total_tasks || 0} total tasks`);
    this._publishJson(this._topic('projects/summary'), summary, true);
  }

  publishStatusSuccess(attributes) {
    this.logger.debug('Publishing status success');
  }

  publishStatusError(attributes) {
    this.logger.debug('Publishing status error');
  }

  publishTaskStatus(taskStatus, scrapedAt = new Date().toISOString()) {
    const payload = { ...(taskStatus || {}), scraped_at: taskStatus?.scraped_at || scrapedAt };
    this.logger.debug(`Publishing task status: inProgress=${Boolean(payload.in_progress_task)}, count=${payload.in_progress_task_count || 0}`);
    this._publishJson(this._topic('tasks/status'), payload, true);
  }

  publishProjects(projects, scrapedAt = new Date().toISOString()) {
    this.logger.debug(`Publishing ${projects.length} project entities`);
    const currentSlugs = new Set();
    const currentClaimSlugs = new Set();

    for (const project of projects) {
      if (numberOrZero(project.tasks) > 0) {
        currentSlugs.add(project.slug);
        this._publishProjectDiscovery(project);
        this._publishProjectState(project, scrapedAt);
        this._publish(this._projectAvailabilityTopic(project.slug), 'online', true);
        this.publishedProjectSlugs.add(project.slug);

        currentClaimSlugs.add(project.slug);
        this._publishProjectClaimDiscovery(project);
        this.publishedClaimProjectSlugs.add(project.slug);
      } else {
        this._deleteProjectEntity(project.slug);
        this._deleteProjectClaimEntity(project.slug);
      }
    }

    for (const publishedSlug of this.publishedProjectSlugs) {
      if (!currentSlugs.has(publishedSlug)) {
        this._deleteProjectEntity(publishedSlug);
      }
    }

    for (const publishedSlug of this.publishedClaimProjectSlugs) {
      if (!currentClaimSlugs.has(publishedSlug)) {
        this._deleteProjectClaimEntity(publishedSlug);
      }
    }

    this.publishedProjectSlugs = currentSlugs;
    this.publishedClaimProjectSlugs = currentClaimSlugs;
  }

  publishPublishedProjectAvailability(available) {
    const state = available ? 'online' : 'offline';
    for (const slug of this.publishedProjectSlugs) {
      this._publish(this._projectAvailabilityTopic(slug), state, true);
    }
  }

  publishPayments(payments, scrapedAt = new Date().toISOString()) {
    this.logger.debug(`Publishing payments summary: available=${payments.available_amount_formatted}, canWithdraw=${payments.can_withdraw}`);
    this._publishJson(this._topic('payments/summary'), { ...payments, scraped_at: payments.scraped_at || scrapedAt }, true);
  }

  async close() {
    this.logger.info('Shutting down MQTT bridge');
    this.publishOffline();
    await new Promise((resolve) => this.client.end(false, {}, resolve));
  }

  _publishProjectDiscovery(project) {
    this._publishDiscovery('sensor', project.slug, {
      name: formatProjectEntityName(project.name),
      unique_id: `${this.topicPrefix}_${project.slug}`,
      state_topic: this._projectStateTopic(project.slug),
      value_template: '{{ value_json.tasks if value_json.tasks is not none else 0 }}',
      force_update: true,
      json_attributes_topic: this._projectStateTopic(project.slug),
      availability_topic: this._projectAvailabilityTopic(project.slug),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:briefcase-outline',
      device: this.device,
    });
  }

  _publishProjectState(project, scrapedAt) {
    const payload = { ...project, scraped_at: scrapedAt };
    delete payload.slug;
    this._publishJson(this._projectStateTopic(project.slug), payload, true);
  }

  _publishProjectClaimDiscovery(project) {
    this._publishDiscovery('button', `claim_project_${project.slug}`, {
      name: formatClaimProjectEntityName(project.name),
      unique_id: `${this.topicPrefix}_claim_project_${project.slug}`,
      command_topic: this._topic(`claim/${project.slug}`),
      payload_press: 'claim',
      availability_topic: this._projectAvailabilityTopic(project.slug),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:briefcase-check',
      device: this.device,
    });
  }

  _publishDiscovery(component, objectId, payload) {
    this._publishJson(`homeassistant/${component}/${this.topicPrefix}_${objectId}/config`, payload, true);
  }

  _deleteProjectEntity(slug) {
    this._publish(`homeassistant/sensor/${this.topicPrefix}_${slug}/config`, '', true);
    this._publish(this._projectAvailabilityTopic(slug), 'offline', true);
  }

  _deleteProjectClaimEntity(slug) {
    this._publish(`homeassistant/button/${this.topicPrefix}_claim_project_${slug}/config`, '', true);
  }

  _publishJson(topic, payload, retain) {
    this._publish(topic, JSON.stringify(payload), retain);
  }

  _publish(topic, payload, retain) {
    this.client.publish(topic, payload, { qos: 1, retain });
  }

  _topic(suffix) {
    return this.topics.topic(suffix);
  }

  _projectStateTopic(slug) {
    return this.topics.projectStateTopic(slug);
  }

  _projectAvailabilityTopic(slug) {
    return this.topics.projectAvailabilityTopic(slug);
  }
}

module.exports = {
  DataAnnotationMqttBridge,
  buildDeviceInfo,
  buildDiscoveryNames,
  formatProjectEntityName,
  shortenProjectName,
};
