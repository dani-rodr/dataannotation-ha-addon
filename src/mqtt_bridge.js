const crypto = require('crypto');

const NULL_LOGGER = {
  debug() {},
  info() {},
  warning() {},
  error() {},
};

class DataAnnotationMqttBridge {
  constructor(options) {
    const mqtt = require('mqtt');
    this.topicPrefix = options.topicPrefix;
    this.profileName = options.profileName;
    this.version = options.version;
    this.logger = options.logger || NULL_LOGGER;
    this.publishTargets = new Set(options.publishTargets || ['projects', 'status']);
    this.scanRequested = { value: false };
    this.withdrawRequested = { value: false };
    this.withdrawLockChange = { value: null };
    this.publishedProjectSlugs = new Set();
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
        [this._topic('command/sync'), this._topic('command/withdraw'), this._topic('withdraw/lock/set')],
        { qos: 1 }
      );
      this.logger.debug(`Subscribed to ${this._topic('command/sync')}`);
      this.logger.debug(`Subscribed to ${this._topic('command/withdraw')}`);
      this.logger.debug(`Subscribed to ${this._topic('withdraw/lock/set')}`);
    });
    this.client.on('close', () => {
      this.connected = false;
      this.logger.warning('MQTT connection closed');
    });
    this.client.on('message', (topic, payload) => {
      const message = String(payload || '').trim().toLowerCase();
      if (topic === this._topic('command/sync') && message === 'now') {
        this.logger.info('Received manual sync request via MQTT');
        this.scanRequested.value = true;
      } else if (topic === this._topic('command/withdraw') && message === 'withdraw') {
        this.logger.info('Received withdraw request via MQTT');
        this.withdrawRequested.value = true;
      } else if (topic === this._topic('withdraw/lock/set') && message === 'on') {
        this.logger.info('Received withdraw lock request: ON');
        this.withdrawLockChange.value = true;
      } else if (topic === this._topic('withdraw/lock/set') && message === 'off') {
        this.logger.info('Received withdraw lock request: OFF');
        this.withdrawLockChange.value = false;
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

  publishDiscovery() {
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

    this._publishDiscovery('switch', 'withdraw_locked', {
      name: names.withdraw_locked,
      unique_id: `${this.topicPrefix}_withdraw_locked`,
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
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      unit_of_measurement: 'tasks',
      state_class: 'measurement',
      icon: 'mdi:counter-plus',
      device: this.device,
    });

    this._publishDiscovery('binary_sensor', 'status', {
      name: names.status,
      unique_id: `${this.topicPrefix}_status`,
      state_topic: this._topic('status/state'),
      payload_on: 'ON',
      payload_off: 'OFF',
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:cloud-search',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'last_sync', {
      name: names.last_sync,
      unique_id: `${this.topicPrefix}_last_sync`,
      state_topic: this._topic('last_sync'),
      value_template: '{{ value_json.lastSuccessfulSyncAt }}',
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      device_class: 'timestamp',
      icon: 'mdi:clock-check-outline',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'available_funds', {
      name: 'Available Funds',
      unique_id: `${this.topicPrefix}_available_funds`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.available_amount }}',
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      unit_of_measurement: 'USD',
      state_class: 'measurement',
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
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      unit_of_measurement: 'USD',
      state_class: 'measurement',
      icon: 'mdi:wallet',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'total_paid_out', {
      name: 'Total Paid Out',
      unique_id: `${this.topicPrefix}_total_paid_out`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.total_paid_out }}',
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      unit_of_measurement: 'USD',
      state_class: 'measurement',
      icon: 'mdi:cash-multiple',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'this_month', {
      name: 'This Month',
      unique_id: `${this.topicPrefix}_this_month`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.this_month }}',
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      unit_of_measurement: 'USD',
      state_class: 'measurement',
      icon: 'mdi:calendar-month',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'best_month', {
      name: 'Best Month',
      unique_id: `${this.topicPrefix}_best_month`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.best_month }}',
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      unit_of_measurement: 'USD',
      state_class: 'measurement',
      icon: 'mdi:trophy',
      device: this.device,
    });

    this._publishDiscovery('sensor', 'pending_approval', {
      name: 'Pending Approval',
      unique_id: `${this.topicPrefix}_pending_approval`,
      state_topic: this._topic('payments/summary'),
      value_template: '{{ value_json.pending_approval }}',
      json_attributes_topic: this._topic('payments/summary'),
      force_update: true,
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      unit_of_measurement: 'USD',
      state_class: 'measurement',
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

  publishSummary(summary) {
    this.logger.debug(`Publishing project summary: ${summary.count} projects, ${summary.total_tasks || 0} total tasks`);
    this._publishJson(this._topic('projects/summary'), summary, true);
  }

  publishStatusSuccess(attributes) {
    this.logger.debug('Publishing status success');
    this._publish(this._topic('status/state'), 'ON', true);
    this._publishJson(this._topic('status/attributes'), attributes, true);
    this._publishJson(this._topic('last_sync'), attributes, true);
  }

  publishStatusError(attributes) {
    this.logger.debug('Publishing status error');
    this._publish(this._topic('status/state'), 'OFF', true);
    this._publishJson(this._topic('status/attributes'), attributes, true);
    this._publishJson(this._topic('last_sync'), attributes, true);
  }

  publishProjects(projects, scrapedAt = new Date().toISOString()) {
    this.logger.debug(`Publishing ${projects.length} project entities`);
    const currentSlugs = new Set();

    for (const project of projects) {
      if (numberOrZero(project.tasks) > 0) {
        currentSlugs.add(project.slug);
        this._publishProjectDiscovery(project);
        this._publishProjectState(project, scrapedAt);
        this._publish(this._projectAvailabilityTopic(project.slug), 'online', true);
        this.publishedProjectSlugs.add(project.slug);
      } else {
        this._deleteProjectEntity(project.slug);
      }
    }

    for (const publishedSlug of this.publishedProjectSlugs) {
      if (!currentSlugs.has(publishedSlug)) {
        this._deleteProjectEntity(publishedSlug);
      }
    }

    this.publishedProjectSlugs = currentSlugs;
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

  _publishDiscovery(component, objectId, payload) {
    this._publishJson(`homeassistant/${component}/${this.topicPrefix}_${objectId}/config`, payload, true);
  }

  _deleteProjectEntity(slug) {
    this._publish(`homeassistant/sensor/${this.topicPrefix}_${slug}/config`, '', true);
    this._publish(this._projectAvailabilityTopic(slug), 'offline', true);
  }

  _publishJson(topic, payload, retain) {
    this._publish(topic, JSON.stringify(payload), retain);
  }

  _publish(topic, payload, retain) {
    this.client.publish(topic, payload, { qos: 1, retain });
  }

  _topic(suffix) {
    return `${this.topicPrefix}/${suffix}`;
  }

  _projectStateTopic(slug) {
    return this._topic(`projects/${slug}/state`);
  }

  _projectAvailabilityTopic(slug) {
    return this._topic(`projects/${slug}/availability`);
  }
}

function slugify(value) {
  const normalized = String(value || 'dataannotation')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'dataannotation';
}

function buildDeviceInfo(profileName, version) {
  return {
    identifiers: [`dataannotation_${slugify(profileName)}`],
    name: 'Data Annotation',
    manufacturer: 'Data Annotation',
    model: 'Worker Projects Scraper',
    sw_version: version,
  };
}

function buildDiscoveryNames() {
  return {
    button: 'Sync Now',
    profile: 'Profile',
    project_count: 'Project Count',
    total_tasks: 'Total Tasks',
    status: 'Status',
    last_sync: 'Last Sync',
    withdraw_locked: 'Withdraw Locked',
    withdraw_funds: 'Withdraw Funds',
    next_payout: 'Next Payout',
  };
}

function formatProjectEntityName(name) {
  return `Project - ${shortenProjectName(name, 40)}`;
}

function shortenProjectName(name, maxLength = 40) {
  const cleaned = normalizeProjectName(name);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeProjectName(name) {
  return String(name || 'Unknown project')
    .replace(/^(?:\[[^\]]+\]\s*)+/, '')
    .replace(/\s+-\s+\d{2}\/\d{2}\/\d{2}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  DataAnnotationMqttBridge,
  buildDeviceInfo,
  buildDiscoveryNames,
  formatProjectEntityName,
  shortenProjectName,
};
