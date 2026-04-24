-- 09-error-handling-config.sql
-- Error Handling Phase 3: Notification Configuration
-- Adds config keys for Slack/Datadog notifications

-- Insert error notification config keys
INSERT INTO app_config (config_key, config_value, config_type, category, description, is_public) VALUES
-- Slack
('error_notification.slack_webhook', '', 'string', 'app', 'Slack webhook URL for error notifications', false),
('error_notification.slack_channel', '#alerts', 'string', 'app', 'Slack channel for notifications', false),

-- Datadog
('error_notification.datadog_api_key', '', 'string', 'app', 'Datadog API key for error tracking', false),
('error_notification.datadog_site', 'datadoghq.com', 'string', 'app', 'Datadog site (datadoghq.com, datadoghq.eu, etc)', false),

-- Settings
('error_notification.enabled', 'true', 'boolean', 'app', 'Enable/disable error notifications', true),
('error_notification.severity_threshold', 'error', 'string', 'app', 'Minimum severity: error, warning, info', true),

-- Rate limiting for notifications
('error_notification.max_per_minute', '10', 'number', 'app', 'Max notifications per minute to prevent spam', true),

-- Which errors to notify
('error_notification.notify_db_errors', 'true', 'boolean', 'app', 'Notify on database errors', true),
('error_notification.notify_timeout_errors', 'true', 'boolean', 'app', 'Notify on timeout errors', true),
('error_notification.notify_unhandled', 'true', 'boolean', 'app', 'Notify on unhandled exceptions', true)
ON CONFLICT (config_key) DO NOTHING;