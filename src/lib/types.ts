export type SettingsMap = Record<string, string>;

export type TelegramAction = "RECEIVE" | "PENDING" | "APPROVE";

export interface TelegramActionConfig {
  action: TelegramAction;
  buttonText: string;
  statusText: string;
  icon: string;
}

export interface RequestRecord {
  id: string;
  reqId: string;
  requestDate: string;
  requestTime: string;
  fullName: string;
  agency: string;
  maskedCitizenId: string;
  status: string;
  note: string;
  telegramStatus: string;
  createdAt: string;
}

export interface CreateRequestInput {
  firstName: string;
  lastName: string;
  citizenId: string;
  agency: string;
}

export interface UpdateRequestStatusInput {
  status: string;
  note?: string;
  sendNotification?: boolean;
}

export interface TelegramRequestNotificationPayload {
  reqId: string;
  name: string;
  agency: string;
  citizenId: string;
  maskedId: string;
  dateText: string;
  timeText: string;
  status: string;
}
