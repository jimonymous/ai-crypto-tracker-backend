import { redis } from "../redis";

export type PaperOrder = {
  id: string;
  userId: string;
  exchange: string;
  symbol: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  amount: number;
  price?: number;
  status: "filled" | "open";
  createdAt: number;
};

const keyForOrders = (userId: string) => `paper:orders:${userId}`;

export const placePaperOrder = async (order: Omit<PaperOrder, "id" | "status" | "createdAt">): Promise<PaperOrder> => {
  const record: PaperOrder = {
    ...order,
    id: `paper-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    status: "filled",
    createdAt: Date.now()
  };
  await redis.rpush(keyForOrders(order.userId), JSON.stringify(record));
  return record;
};

export const listPaperOrders = async (userId: string): Promise<PaperOrder[]> => {
  const raw = await redis.lrange(keyForOrders(userId), 0, -1);
  return raw.map((r) => JSON.parse(r));
};
