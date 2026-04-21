import { createRequest, createServerErrorResponse, getRequests } from "@/lib/requests";
import { createRequestSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const requests = await getRequests();
    return Response.json(requests, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return createServerErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = createRequestSchema.parse(await request.json());
    const result = await createRequest(payload);
    return Response.json(result);
  } catch (error) {
    return createServerErrorResponse(error);
  }
}
