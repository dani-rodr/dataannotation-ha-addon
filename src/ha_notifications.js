async function createPersistentNotification({ title, message, notificationId, logger }) {
  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    throw new Error('SUPERVISOR_TOKEN is required for Home Assistant persistent notifications');
  }

  const response = await fetch('http://supervisor/core/api/services/persistent_notification/create', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      message,
      notification_id: notificationId,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const error = new Error(`Failed to create persistent notification (${response.status}): ${body}`);
    logger?.warning?.(error.message);
    throw error;
  }

  logger?.info?.(`Created persistent notification: ${title}`);
}

module.exports = {
  createPersistentNotification,
};
