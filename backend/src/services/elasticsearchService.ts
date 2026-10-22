import { Client } from '@elastic/elasticsearch';
import prisma from '../config/prisma';

export interface EmailDocument {
  id: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  etherealPreviewUrl?: string | null;
  createdAt: string;
}

class ElasticsearchService {
  private client: Client;
  private indexName = 'reachinbox-emails';
  private isConnected = false;

  constructor() {
    const node = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
    this.client = new Client({
      node,
      requestTimeout: 3000,
      maxRetries: 1,
    });
  }

  public async initialize(): Promise<void> {
    try {
      console.log('🔄 Checking Elasticsearch cluster connection...');
      const ping = await this.client.ping();
      if (ping) {
        this.isConnected = true;
        console.log('✅ Elasticsearch connected successfully!');
        await this.ensureIndex();
      }
    } catch (err: any) {
      this.isConnected = false;
      console.log(`ℹ️ Elasticsearch node not reachable (${err.message}). Hybrid search mode active with PostgreSQL full-text fallback.`);
    }
  }

  private async ensureIndex(): Promise<void> {
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
    } catch (err: any) {
      console.error('❌ Error creating Elasticsearch index:', err.message);
    }
  }

  public async indexEmail(email: any): Promise<void> {
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
    } catch (err: any) {
      console.warn(`⚠️ Elasticsearch indexing failed for ${email.id}:`, err.message);
    }
  }

  public async updateEmailStatus(id: string, status: string, extra: Record<string, any> = {}): Promise<void> {
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
    } catch (err: any) {
      console.warn(`⚠️ Elasticsearch update status failed for ${id}:`, err.message);
    }
  }

  public async searchEmails(params: {
    query: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; emails: any[]; source: 'elasticsearch' | 'database' }> {
    const { query, status, limit = 20, offset = 0 } = params;

    // 1. Try Elasticsearch first
    if (this.isConnected && query) {
      try {
        const mustClauses: any[] = [
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

        const emails = hits.map((hit: any) => ({
          ...hit._source,
          highlight: hit.highlight,
        }));

        return {
          total,
          emails,
          source: 'elasticsearch',
        };
      } catch (err: any) {
        console.warn('⚠️ Elasticsearch query failed, falling back to DB full-text search:', err.message);
      }
    }

    // 2. Resilient Database Search (fallback or default when ES not running)
    const whereClause: any = {};

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

  public getStatus() {
    return {
      connected: this.isConnected,
      index: this.indexName,
      node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    };
  }
}

export const elasticsearchService = new ElasticsearchService();
export default elasticsearchService;
