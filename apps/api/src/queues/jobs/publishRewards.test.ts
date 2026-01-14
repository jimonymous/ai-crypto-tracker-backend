import { describe, expect, it, vi } from "vitest";
import { publishRewardsProcessor } from "./publishRewards";

const publishRewardsEpochMock = vi.fn();
const currentEpochIdMock = vi.fn();

vi.mock("../../rewards/publish", () => ({
  publishRewardsEpoch: (...args: unknown[]) => publishRewardsEpochMock(...args)
}));

vi.mock("../../rewards/accrue", () => ({
  currentEpochId: () => currentEpochIdMock()
}));

describe("publishRewardsProcessor", () => {
  it("publishes with provided epoch", async () => {
    publishRewardsEpochMock.mockResolvedValue({ txHash: "0xabc" });
    const job: any = { data: { epochId: "5" }, log: vi.fn() };
    const res = await publishRewardsProcessor(job);
    expect(publishRewardsEpochMock).toHaveBeenCalledWith("5");
    expect(res.txHash).toBe("0xabc");
  });

  it("falls back to current epoch when missing", async () => {
    publishRewardsEpochMock.mockResolvedValue({ txHash: "0xdef" });
    currentEpochIdMock.mockReturnValue("7");
    const job: any = { data: {}, log: vi.fn() };
    const res = await publishRewardsProcessor(job);
    expect(publishRewardsEpochMock).toHaveBeenCalledWith("7");
    expect(res.txHash).toBe("0xdef");
  });
});
