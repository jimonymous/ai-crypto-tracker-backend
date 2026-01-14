import { randomUUID } from "node:crypto";
import { redis } from "../redis";

const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MAX_MESSAGES = 50;
const USER_INDEX_PREFIX = "chat:user:";
const META_PREFIX = "chat:conv:";
const MSG_PREFIX = "chat:convmsg:";

export type ConversationMeta = {
  id: string;
  userId: string;
  title?: string;
  createdAt: number;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

const metaKey = (id: string) => `${META_PREFIX}${id}:meta`;
const msgKey = (id: string) => `${MSG_PREFIX}${id}`;
const userIdxKey = (userId: string) => `${USER_INDEX_PREFIX}${userId}:convs`;

export const createConversation = async (userId: string, title?: string): Promise<ConversationMeta> => {
  const id = randomUUID();
  const meta: ConversationMeta = { id, userId, title, createdAt: Date.now() };
  await redis.set(metaKey(id), JSON.stringify(meta), "EX", TTL_SECONDS);
  await redis.zadd(userIdxKey(userId), meta.createdAt, id);
  await redis.expire(userIdxKey(userId), TTL_SECONDS);
  return meta;
};

export const getConversation = async (id: string): Promise<ConversationMeta | null> => {
  const raw = await redis.get(metaKey(id));
  return raw ? (JSON.parse(raw) as ConversationMeta) : null;
};

export const addMessage = async (conversationId: string, msg: ConversationMessage) => {
  const key = msgKey(conversationId);
  await redis.rpush(key, JSON.stringify(msg));
  await redis.ltrim(key, -MAX_MESSAGES, -1);
  await redis.expire(key, TTL_SECONDS);
};

export const listMessages = async (conversationId: string, limit = 20): Promise<ConversationMessage[]> => {
  const key = msgKey(conversationId);
  const len = await redis.llen(key);
  const start = Math.max(0, len - limit);
  const raw = await redis.lrange(key, start, len);
  return raw.map((r) => JSON.parse(r) as ConversationMessage);
};

export const listConversations = async (userId: string, limit = 20): Promise<ConversationMeta[]> => {
  const ids = await redis.zrevrange(userIdxKey(userId), 0, limit - 1);
  const metas: ConversationMeta[] = [];
  for (const id of ids) {
    const meta = await getConversation(id);
    if (meta) metas.push(meta);
  }
  return metas;
};
