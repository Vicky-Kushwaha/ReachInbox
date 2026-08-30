import { Client } from "@elastic/elasticsearch";
import { env } from "../config/env";
import { EmailRow } from "../types";

export const esClient = new Client({ node: env.ELASTICSEARCH_URL });

const INDEX = env.ELASTICSEARCH_INDEX;

export async function ensureIndex(): Promise<void> {
  try {
    const exists = await esClient.indices.exists({ index: INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            recipient: { type: "text", fields: { keyword: { type: "keyword" } } },
            subject: { type: "text" },
            body: { type: "text" },
            status: { type: "keyword" },
            sender_id: { type: "integer" },
            campaign_id: { type: "integer" },
            scheduled_time: { type: "date" },
            sent_at: { type: "date" },
          },
        },
      });
      console.log(`[elasticsearch] created index "${INDEX}"`);
    }
  } catch (err) {
    console.warn("[elasticsearch] could not ensure index (is ES running?):", (err as Error).message);
  }
}

export async function indexEmail(row: EmailRow): Promise<void> {
  try {
    await esClient.index({
      index: INDEX,
      id: String(row.id),
      document: {
        recipient: row.recipient,
        subject: row.subject,
        body: row.body,
        status: row.status,
        sender_id: row.sender_id,
        campaign_id: row.campaign_id,
        scheduled_time: row.scheduled_time,
        sent_at: row.sent_at,
      },
    });
  } catch (err) {
    // Search is a supporting feature — never let ES being down break sending.
    console.warn("[elasticsearch] index failed:", (err as Error).message);
  }
}

export async function searchEmails(query: string, limit = 50) {
  try {
    const result = await esClient.search({
      index: INDEX,
      size: limit,
      query: {
        multi_match: {
          query,
          fields: ["recipient^2", "subject^2", "body"],
          fuzziness: "AUTO",
        },
      },
    });
    return result.hits.hits.map((h) => ({ id: h._id, ...(h._source as object) }));
  } catch (err) {
    console.warn("[elasticsearch] search failed:", (err as Error).message);
    return [];
  }
}
