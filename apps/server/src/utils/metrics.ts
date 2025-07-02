import { config } from '../config/index';
import { logger, metricsLogger } from './logger';

// Metrics storage interface
interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

interface CounterMetric {
  name: string;
  help: string;
  value: number;
  labels: Record<string, number>;
}

interface GaugeMetric {
  name: string;
  help: string;
  value: number;
  labels: Record<string, number>;
}

interface HistogramMetric {
  name: string;
  help: string;
  buckets: number[];
  values: Record<string, number[]>;
  counts: Record<string, number>;
  sums: Record<string, number>;
}

/**
 * Simple metrics collection system
 * In production, you'd use Prometheus client or similar
 */
class MetricsCollector {
  private counters: Map<string, CounterMetric> = new Map();
  private gauges: Map<string, GaugeMetric> = new Map();
  private histograms: Map<string, HistogramMetric> = new Map();
  private timers: Map<string, number> = new Map();

  /**
   * Create or increment a counter
   */
  incrementCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
    const labelKey = this.getLabelKey(labels);
    let counter = this.counters.get(name);
    
    if (!counter) {
      counter = {
        name,
        help: `Counter metric: ${name}`,
        value: 0,
        labels: {},
      };
      this.counters.set(name, counter);
    }
    
    counter.value += value;
    counter.labels[labelKey] = (counter.labels[labelKey] || 0) + value;
    
    metricsLogger.debug(`Counter incremented: ${name}`, { labels, value });
  }

  /**
   * Set gauge value
   */
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const labelKey = this.getLabelKey(labels);
    let gauge = this.gauges.get(name);
    
    if (!gauge) {
      gauge = {
        name,
        help: `Gauge metric: ${name}`,
        value: 0,
        labels: {},
      };
      this.gauges.set(name, gauge);
    }
    
    gauge.value = value;
    gauge.labels[labelKey] = value;
    
    metricsLogger.debug(`Gauge set: ${name}`, { labels, value });
  }

  /**
   * Increment gauge value
   */
  incrementGauge(name: string, value: number = 1, labels: Record<string, string> = {}): void {
    const labelKey = this.getLabelKey(labels);
    let gauge = this.gauges.get(name);
    
    if (!gauge) {
      gauge = {
        name,
        help: `Gauge metric: ${name}`,
        value: 0,
        labels: {},
      };
      this.gauges.set(name, gauge);
    }
    
    gauge.value += value;
    gauge.labels[labelKey] = (gauge.labels[labelKey] || 0) + value;
    
    metricsLogger.debug(`Gauge incremented: ${name}`, { labels, value });
  }

  /**
   * Decrement gauge value
   */
  decrementGauge(name: string, value: number = 1, labels: Record<string, string> = {}): void {
    this.incrementGauge(name, -value, labels);
  }

  /**
   * Record histogram value
   */
  recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const labelKey = this.getLabelKey(labels);
    let histogram = this.histograms.get(name);
    
    if (!histogram) {
      histogram = {
        name,
        help: `Histogram metric: ${name}`,
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10],
        values: {},
        counts: {},
        sums: {},
      };
      this.histograms.set(name, histogram);
    }
    
    if (!histogram.values[labelKey]) {
      histogram.values[labelKey] = [];
      histogram.counts[labelKey] = 0;
      histogram.sums[labelKey] = 0;
    }
    
    histogram.values[labelKey].push(value);
    histogram.counts[labelKey]++;
    histogram.sums[labelKey] += value;
    
    metricsLogger.debug(`Histogram recorded: ${name}`, { labels, value });
  }

  /**
   * Start a timer
   */
  startTimer(name: string): () => void {
    const start = Date.now();
    const timerKey = `${name}_${Math.random()}`;
    this.timers.set(timerKey, start);
    
    return () => {
      const end = Date.now();
      const duration = (end - start) / 1000; // Convert to seconds
      this.timers.delete(timerKey);
      this.recordHistogram(`${name}_duration_seconds`, duration);
      return duration;
    };
  }

  /**
   * Get all metrics in Prometheus format
   */
  getMetrics(): string {
    const lines: string[] = [];
    
    // Counters
    for (const counter of this.counters.values()) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);
      
      if (Object.keys(counter.labels).length === 0) {
        lines.push(`${counter.name} ${counter.value}`);
      } else {
        for (const [labelKey, value] of Object.entries(counter.labels)) {
          lines.push(`${counter.name}{${labelKey}} ${value}`);
        }
      }
    }
    
    // Gauges
    for (const gauge of this.gauges.values()) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      
      if (Object.keys(gauge.labels).length === 0) {
        lines.push(`${gauge.name} ${gauge.value}`);
      } else {
        for (const [labelKey, value] of Object.entries(gauge.labels)) {
          lines.push(`${gauge.name}{${labelKey}} ${value}`);
        }
      }
    }
    
    // Histograms
    for (const histogram of this.histograms.values()) {
      lines.push(`# HELP ${histogram.name} ${histogram.help}`);
      lines.push(`# TYPE ${histogram.name} histogram`);
      
      for (const [labelKey, values] of Object.entries(histogram.values)) {
        const count = histogram.counts[labelKey];
        const sum = histogram.sums[labelKey];
        
        // Bucket counts
        for (const bucket of histogram.buckets) {
          const bucketCount = values.filter(v => v <= bucket).length;
          lines.push(`${histogram.name}_bucket{${labelKey},le="${bucket}"} ${bucketCount}`);
        }
        
        // +Inf bucket
        lines.push(`${histogram.name}_bucket{${labelKey},le="+Inf"} ${count}`);
        
        // Count and sum
        lines.push(`${histogram.name}_count{${labelKey}} ${count}`);
        lines.push(`${histogram.name}_sum{${labelKey}} ${sum}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Get metrics as JSON
   */
  getMetricsJSON(): any {
    return {
      counters: Array.from(this.counters.values()),
      gauges: Array.from(this.gauges.values()),
      histograms: Array.from(this.histograms.values()),
      timestamp: Date.now(),
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.timers.clear();
    metricsLogger.info('All metrics reset');
  }

  /**
   * Get label key from labels object
   */
  private getLabelKey(labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) return '';
    
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');
  }
}

// Create global metrics instance
const metrics = new MetricsCollector();

/**
 * Application-specific metrics
 */
export class ChatMetrics {
  // Connection metrics
  static incrementConnections(type: 'socket' | 'http' = 'socket'): void {
    metrics.incrementCounter('chat_connections_total', { type });
    metrics.incrementGauge('chat_active_connections', 1, { type });
  }

  static decrementConnections(type: 'socket' | 'http' = 'socket'): void {
    metrics.incrementCounter('chat_disconnections_total', { type });
    metrics.decrementGauge('chat_active_connections', 1, { type });
  }

  static setActiveConnections(count: number, type: 'socket' | 'http' = 'socket'): void {
    metrics.setGauge('chat_active_connections', count, { type });
  }

  // Message metrics
  static incrementMessagesSent(type: string = 'text'): void {
    metrics.incrementCounter('chat_messages_sent_total', { type });
  }

  static incrementMessagesDelivered(): void {
    metrics.incrementCounter('chat_messages_delivered_total');
  }

  static incrementMessagesRead(): void {
    metrics.incrementCounter('chat_messages_read_total');
  }

  static recordMessageLength(length: number): void {
    metrics.recordHistogram('chat_message_length_bytes', length);
  }

  // User metrics
  static setActiveUsers(count: number, timeframe: 'daily' | 'weekly' | 'monthly' = 'daily'): void {
    metrics.setGauge('chat_active_users', count, { timeframe });
  }

  static incrementUserRegistrations(): void {
    metrics.incrementCounter('chat_user_registrations_total');
  }

  static incrementUserLogins(): void {
    metrics.incrementCounter('chat_user_logins_total');
  }

  // Group metrics
  static incrementGroupsCreated(): void {
    metrics.incrementCounter('chat_groups_created_total');
  }

  static incrementGroupMessages(): void {
    metrics.incrementCounter('chat_group_messages_total');
  }

  // API metrics
  static recordApiRequest(method: string, route: string, status: number, duration: number): void {
    const labels = { method, route, status: status.toString() };
    metrics.incrementCounter('chat_api_requests_total', labels);
    metrics.recordHistogram('chat_api_request_duration_seconds', duration / 1000, labels);
  }

  static incrementApiErrors(method: string, route: string, status: number, error: string): void {
    metrics.incrementCounter('chat_api_errors_total', { method, route, status: status.toString(), error });
  }

  // File upload metrics
  static incrementFileUploads(type: string): void {
    metrics.incrementCounter('chat_file_uploads_total', { type });
  }

  static recordFileSize(size: number, type: string): void {
    metrics.recordHistogram('chat_file_size_bytes', size, { type });
  }

  // Call metrics
  static incrementCallsInitiated(type: 'audio' | 'video'): void {
    metrics.incrementCounter('chat_calls_initiated_total', { type });
  }

  static incrementCallsConnected(type: 'audio' | 'video'): void {
    metrics.incrementCounter('chat_calls_connected_total', { type });
  }

  static incrementCallsEnded(type: 'audio' | 'video'): void {
    metrics.incrementCounter('chat_calls_ended_total', { type });
  }

  static recordCallDuration(duration: number, type: 'audio' | 'video'): void {
    metrics.recordHistogram('chat_call_duration_seconds', duration, { type });
  }

  // Search metrics
  static incrementSearchRequests(type: 'users' | 'groups' | 'messages' | 'global'): void {
    metrics.incrementCounter('chat_search_requests_total', { type });
  }

  static recordSearchDuration(duration: number, type: 'users' | 'groups' | 'messages' | 'global'): void {
    metrics.recordHistogram('chat_search_duration_seconds', duration / 1000, { type });
  }

  // System metrics
  static recordMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    metrics.setGauge('chat_memory_usage_bytes', memUsage.rss, { type: 'rss' });
    metrics.setGauge('chat_memory_usage_bytes', memUsage.heapTotal, { type: 'heap_total' });
    metrics.setGauge('chat_memory_usage_bytes', memUsage.heapUsed, { type: 'heap_used' });
    metrics.setGauge('chat_memory_usage_bytes', memUsage.external, { type: 'external' });
  }

  static setUptime(): void {
    metrics.setGauge('chat_uptime_seconds', process.uptime());
  }

  // Database metrics
  static recordDatabaseQuery(operation: string, duration: number, success: boolean): void {
    const labels = { operation, success: success.toString() };
    metrics.incrementCounter('chat_database_queries_total', labels);
    metrics.recordHistogram('chat_database_query_duration_seconds', duration / 1000, labels);
  }

  static incrementDatabaseErrors(operation: string): void {
    metrics.incrementCounter('chat_database_errors_total', { operation });
  }

  // Cache metrics
  static incrementCacheHits(type: string): void {
    metrics.incrementCounter('chat_cache_hits_total', { type });
  }

  static incrementCacheMisses(type: string): void {
    metrics.incrementCounter('chat_cache_misses_total', { type });
  }

  static recordCacheOperation(operation: 'get' | 'set' | 'del', duration: number, success: boolean): void {
    const labels = { operation, success: success.toString() };
    metrics.incrementCounter('chat_cache_operations_total', labels);
    metrics.recordHistogram('chat_cache_operation_duration_seconds', duration / 1000, labels);
  }

  // Rate limiting metrics
  static incrementRateLimitHits(endpoint: string): void {
    metrics.incrementCounter('chat_rate_limit_hits_total', { endpoint });
  }

  // Security metrics
  static incrementAuthAttempts(success: boolean): void {
    metrics.incrementCounter('chat_auth_attempts_total', { success: success.toString() });
  }

  static incrementSuspiciousActivity(type: string): void {
    metrics.incrementCounter('chat_suspicious_activity_total', { type });
  }
}

/**
 * Middleware to collect HTTP metrics
 */
export const metricsMiddleware = (req: any, res: any, next: any) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route?.path || req.path || 'unknown';
    ChatMetrics.recordApiRequest(req.method, route, res.statusCode, duration);
    
    if (res.statusCode >= 400) {
      ChatMetrics.incrementApiErrors(req.method, route, res.statusCode, 'http_error');
    }
  });
  
  next();
};

/**
 * Performance monitoring decorator
 */
export const measurePerformance = (metricName: string) => {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const timer = metrics.startTimer(metricName);
      try {
        const result = await method.apply(this, args);
        timer();
        return result;
      } catch (error) {
        timer();
        throw error;
      }
    };
  };
};

/**
 * System metrics collection
 */
export const collectSystemMetrics = (): void => {
  ChatMetrics.recordMemoryUsage();
  ChatMetrics.setUptime();
};

/**
 * Start metrics collection interval
 */
export const startMetricsCollection = (): void => {
  if (!config.monitoring.enabled) {
    logger.info('Metrics collection disabled');
    return;
  }

  // Collect system metrics every 30 seconds
  setInterval(() => {
    collectSystemMetrics();
  }, 30000);

  logger.info('Metrics collection started');
};

/**
 * Get all metrics
 */
export const getMetrics = (): string => {
  return metrics.getMetrics();
};

/**
 * Get metrics as JSON
 */
export const getMetricsJSON = (): any => {
  return metrics.getMetricsJSON();
};

/**
 * Reset all metrics
 */
export const resetMetrics = (): void => {
  metrics.reset();
};

// Export the metrics instance for direct access
export { metrics };

// Export default
export default {
  ChatMetrics,
  metricsMiddleware,
  measurePerformance,
  collectSystemMetrics,
  startMetricsCollection,
  getMetrics,
  getMetricsJSON,
  resetMetrics,
  metrics,
};
