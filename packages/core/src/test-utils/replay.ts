// Test helper: a Provider that replays the recorded fixtures under fixtures/raw. Never hits the
// network; a request without a fixture throws, which is the intended failure mode of a unit test.
import { fileURLToPath } from "node:url";
import { FileFixtureStore } from "../node/fileStore.js";
import { Provider } from "../provider.js";

export const FIXTURES_ROOT = fileURLToPath(new URL("../../../../fixtures/raw", import.meta.url));

export function replayProvider(): Provider {
  return new Provider({ mode: "replay", store: new FileFixtureStore(FIXTURES_ROOT) });
}

/** Hashes pinned in fixtures/hashes.json, by label, so tests read like the spec. */
export const PREVIEWNET = {
  incrementSuccess: "0x9480b2b38d6b1389cf553603bd81c3796c57e66b669b11f1bb0b00bc5b858bb1",
  viewSuccess: "0x35ff4be8197f643b5243eecbe00459c18b58558a306a716bbf60b498acba7e50",
  decrementSuccess: "0x712fb54cb139a16e40885f60fb3c1026a284931af3326837685a625b8ad756ee",
  decrementRevert: "0x3977046f09ded41a000370bc47ff246befd74909eb414a4a02d14a36b017f716",
  michelsonToEvmNested: "oo3MFijX6ZMxQpee3vGhYabb9C4Jcxm28MUTQqv2GnLa1NKE16W",
  michelsonCounter: "KT1LT2vXbnTvjjsfZJQnArm21orXLsh95Tgv",
  evmCounter: "0x0e11ecfd2aca4b8290ea5db996f46dd238374b3d",
} as const;

export const MAINNET = {
  genericCallWithValue: "0xc5e137c2ba6016f2dc7170edbf1dc03e0e7599174502f09c3e1e1d6715c8a57a",
  genericCall: "0xf4f48ca755363f51db8a835849aaa05bb1fc912d845dd940971748c45176492c",
  withdrawViaCallEvm: "opZX4Z3TuidPmJDB93WatMNKBfbkDQipUXvFiVeS6LY9JiovffV",
  aliasGenericCall: "onveDaSLbKT7DpAueu1jM8EZMfbTZSujHwUV7mAiTcDYMbtaVnD",
  callEvmToUser: "ooHmHLh2oSJQT8dy2cQ48buPVmjX949nkCfhkLK1GsgZfoct5Ky",
} as const;
