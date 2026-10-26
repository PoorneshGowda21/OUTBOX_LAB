import { Client } from '@elastic/elasticsearch';
import prisma from '../config/prisma.js';

class ElasticsearchService {
  constructor() {
    const node = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
    this.client = new Client({
      node,
      requestTimeout: 3000,
      maxRetries: 1,
    });
    this.indexName = 'reachinbox-emails';
    this.isConnected = false;
  }

  async initialize() {
    try {
      console.log('🔄 Checking Elasticsearch cluster connection...');
      const ping = await this.client.ping();
      if (ping) {
        this.isConnected = true;
        console.log('✅ Elasticsearch connected successfully!');
        await this.ensureIndex();
      }
    } catch (err) {
      this.isConnected = false;
      console.log(`ℹ️ Elasticsearch node not reachable (${err.message}). Hybrid search mode active with PostgreSQL full-text fallback.`);
    }
  }

  async ensureIndex() {
    if (!this.isConnected) return;
    try {
      const exists = await this.client.indices.exists({ index: this.indexName });
      if (!exists) {
        await this.client.indices.create({
          index: this.indexName,
          body: {
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,
              analysis: {
                analyzer: {
                  email_analyzer: {
                    type: 'custom',
                    tokenizer: 'uax_url_email',
                    filter: ['lowercase'],
                  },
                },
              },
            },
            mappings: {
              properties: {
                id: { type: 'keyword' },
                senderEmail: {
                  type: 'text',
                  analyzer: 'email_analyzer',
                  fields: { keyword: { type: 'keyword' } },
                },
                recipientEmail: {
                  type: 'text',
                  analyzer: 'email_analyzer',
                  fields: { keyword: { type: 'keyword' } },
                },
                subject: {
                  type: 'text',
                  fields: { keyword: { type: 'keyword' } },
                },
                body: { type: 'text' },
                status: { type: 'keyword' },
                scheduledAt: { type: 'date' },
                sentAt: { type: 'date' },
                etherealPreviewUrl: { type: 'keyword' },
                createdAt: { type: 'date' },
              },
            },
          },
        });
        console.log(`✅ Elasticsearch index '${this.indexName}' created with mappings.`);
      }
    } catch (err) {
      console.error('❌ Error creating Elasticsearch index:', err.message);
    }
  }

  async indexEmail(email) {
    if (!this.isConnected) return;
    try {
      await this.client.index({
        index: this.indexName,
        id: email.id,
        document: {
          id: email.id,
          senderEmail: email.senderEmail,
          recipientEmail: email.recipientEmail,
          subject: email.subject,
          body: email.body,
          status: email.status,
          scheduledAt: new Date(email.scheduledAt).toISOString(),
          sentAt: email.sentAt ? new Date(email.sentAt).toISOString() : null,
          etherealPreviewUrl: email.etherealPreviewUrl,
          createdAt: new Date(email.createdAt).toISOString(),
        },
      });
    } catch (err) {
      console.warn(`⚠️ Elasticsearch indexing failed for ${email.id}:`, err.message);
    }
  }

  async updateEmailStatus(id, status, extra = {}) {
    if (!this.isConnected) return;
    try {
      await this.client.update({
        index: this.indexName,
        id,
        doc: {
          status,
          ...extra,
        },
      });
    } catch (err) {
      console.warn(`⚠️ Elasticsearch update status failed for ${id}:`, err.message);
    }
  }

  async searchEmails({ query, status, limit = 20, offset = 0 }) {
    // 1. Try Elasticsearch first
    if (this.isConnected && query) {
      try {
        const mustClauses = [
          {
            multi_match: {
              query,
              fields: ['subject^3', 'body', 'recipientEmail^2', 'senderEmail^2'],
              fuzziness: 'AUTO',
            },
          },
        ];

        if (status) {
          mustClauses.push({ term: { status } });
        }

        const result = await this.client.search({
          index: this.indexName,
          from: offset,
          size: limit,
          query: {
            bool: {
              must: mustClauses,
            },
          },
          highlight: {
            fields: {
              subject: {},
              body: {},
            },
          },
        });

        const hits = result.hits.hits;
        const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value || 0;

        const emails = hits.map((hit) => ({
          ...hit._source,
          highlight: hit.highlight,
        }));

        return {
          total,
          emails,
          source: 'elasticsearch',
        };
      } catch (err) {
        console.warn('⚠️ Elasticsearch query failed, falling back to DB full-text search:', err.message);
      }
    }

    // 2. Resilient Database Search (fallback or default when ES not running)
    const whereClause = {};

    if (query) {
      whereClause.OR = [
        { subject: { contains: query, mode: 'insensitive' } },
        { body: { contains: query, mode: 'insensitive' } },
        { recipientEmail: { contains: query, mode: 'insensitive' } },
        { senderEmail: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (status) {
      whereClause.status = status;
    }

    const [total, emails] = await Promise.all([
      prisma.emailJob.count({ where: whereClause }),
      prisma.emailJob.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    return {
      total,
      emails,
      source: 'database',
    };
  }

  getStatus() {
    return {
      connected: this.isConnected,
      index: this.indexName,
      node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    };
  }
}

export const elasticsearchService = new ElasticsearchService();
export default elasticsearchService;
