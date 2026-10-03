import { addCronResponseFields } from "@/lib/cron";
import { GET as dailySync } from "../daily-sync/route";

export async function GET(request: Request) {
  const response = await dailySync(request);
  return addCronResponseFields(response, (body) => ({
    added: Number(body.created ?? 0),
    skipped: Number(body.existing ?? 0),
    warnings: [],
  }));
}
