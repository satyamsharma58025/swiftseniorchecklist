import { addCronResponseFields } from "@/lib/cron";
import { POST as dailySync } from "../daily-sync/route";

export async function POST(request: Request) {
  const response = await dailySync(request);
  return addCronResponseFields(response, (body) => ({
    published: Number(body.created ?? 0) + Number(body.existing ?? 0),
  }));
}
