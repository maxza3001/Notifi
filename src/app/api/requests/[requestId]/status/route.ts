import { createServerErrorResponse, updateRequestStatusByReqId } from "@/lib/requests";
import { updateRequestStatusSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await context.params;
    const payload = updateRequestStatusSchema.parse(await request.json());
    const result = await updateRequestStatusByReqId(requestId, payload);
    return Response.json(result);
  } catch (error) {
    return createServerErrorResponse(error);
  }
}
