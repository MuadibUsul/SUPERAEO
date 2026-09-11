import { ensureObjectStorageBucket } from "@/server/external/object-storage";

await ensureObjectStorageBucket();
console.log("Private evidence bucket is ready.");
