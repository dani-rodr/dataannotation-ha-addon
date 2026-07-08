function buildTopicHelpers(topicPrefix) {
  return {
    topic: (suffix) => `${topicPrefix}/${suffix}`,
    projectStateTopic: (slug) => `${topicPrefix}/projects/${slug}/state`,
    projectAvailabilityTopic: (slug) => `${topicPrefix}/projects/${slug}/availability`,
  };
}

module.exports = {
  buildTopicHelpers,
};
