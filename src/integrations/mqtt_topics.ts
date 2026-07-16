function buildTopicHelpers(topicPrefix) {
  return {
    topic: (suffix) => `${topicPrefix}/${suffix}`,
    projectStateTopic: (slug) => `${topicPrefix}/projects/${slug}/state`,
    projectAvailabilityTopic: (slug) => `${topicPrefix}/projects/${slug}/availability`,
    autoAcceptProjectStateTopic: (projectKey) => `${topicPrefix}/auto_accept/projects/${projectKey}/state`,
    autoAcceptProjectCommandTopic: (projectKey) => `${topicPrefix}/auto_accept/projects/${projectKey}/set`,
    autoAcceptProjectCommandBaseTopic: () => `${topicPrefix}/auto_accept/projects`,
  };
}

module.exports = {
  buildTopicHelpers,
};
