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
      this.client.subscribe(this._topic('command/sync'), { qos: 1 });
      this.logger.debug(`Subscribed to ${this._topic('command/sync')}`);
    });
    this.client.on('close', () => {
      this.connected = false;
      this.logger.warning('MQTT connection closed');
    });
    this.client.on('message', (_, payload) => {
      const message = String(payload || '').trim().toLowerCase();
      if (message === 'now') {
        this.logger.info('Received manual sync request via MQTT');
        this.scanRequested.value = true;
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

    this._publishDiscovery('sensor', 'profile_name', {
      name: names.profile,
      unique_id: `${this.topicPrefix}_profile_name`,
      state_topic: this._topic('profile/state'),
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
      json_attributes_topic: this._topic('projects/summary'),
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:counter',
      device: this.device,
    });

    this._publishDiscovery('binary_sensor', 'status', {
      name: names.status,
      unique_id: `${this.topicPrefix}_status`,
      state_topic: this._topic('status/state'),
      payload_on: 'ON',
      payload_off: 'OFF',
      json_attributes_topic: this._topic('status/attributes'),
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
      json_attributes_topic: this._topic('last_sync'),
      availability_topic: this._topic('availability'),
      payload_available: 'online',
      payload_not_available: 'offline',
      device_class: 'timestamp',
      icon: 'mdi:clock-check-outline',
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

  publishSummary(summary) {
    this.logger.debug(`Publishing project summary: ${summary.count} projects`);
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

  publishProjects(projects) {
    this.logger.debug(`Publishing ${projects.length} project entities`);
    const currentSlugs = new Set();

    for (const project of projects) {
      currentSlugs.add(project.slug);
      this._publishProjectDiscovery(project);
      this._publishProjectState(project);
      this._publish(this._projectAvailabilityTopic(project.slug), 'online', true);
      this.publishedProjectSlugs.add(project.slug);
    }

    for (const publishedSlug of this.publishedProjectSlugs) {
      if (!currentSlugs.has(publishedSlug)) {
        this._publish(this._projectAvailabilityTopic(publishedSlug), 'offline', true);
      }
    }

    this.publishedProjectSlugs = currentSlugs;
  }

  async close() {
    this.logger.info('Shutting down MQTT bridge');
    this.publishOffline();
    await new Promise((resolve) => this.client.end(false, {}, resolve));
  }

  _publishProjectDiscovery(project) {
    this._publishDiscovery('sensor', project.slug, {
      name: project.name,
      unique_id: `${this.topicPrefix}_${project.slug}`,
      state_topic: this._projectStateTopic(project.slug),
      value_template: '{{ value_json.tasks if value_json.tasks is not none else 0 }}',
      json_attributes_topic: this._projectStateTopic(project.slug),
      availability_topic: this._projectAvailabilityTopic(project.slug),
      payload_available: 'online',
      payload_not_available: 'offline',
      icon: 'mdi:briefcase-outline',
      device: this.device,
    });
  }

  _publishProjectState(project) {
    const payload = { ...project };
    delete payload.slug;
    this._publishJson(this._projectStateTopic(project.slug), payload, true);
  }

  _publishDiscovery(component, objectId, payload) {
    this._publishJson(`homeassistant/${component}/${this.topicPrefix}_${objectId}/config`, payload, true);
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
    status: 'Status',
    last_sync: 'Last Sync',
  };
}

module.exports = {
  DataAnnotationMqttBridge,
  buildDeviceInfo,
  buildDiscoveryNames,
};
