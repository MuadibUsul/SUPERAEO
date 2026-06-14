import type { UserRole } from "@/generated/prisma/enums";

export const OPERATOR_ROLES: UserRole[] = [
  "platform_owner",
  "operator_admin",
  "operator_viewer",
];

export const OPERATOR_WRITE_ROLES: UserRole[] = [
  "platform_owner",
  "operator_admin",
];

export const CUSTOMER_WRITE_ROLES: UserRole[] = [
  "platform_owner",
  "operator_admin",
  "customer_owner",
  "customer_member",
];

export function isOperatorRole(role: UserRole) {
  return OPERATOR_ROLES.includes(role);
}

export function canWriteAdmin(role: UserRole) {
  return OPERATOR_WRITE_ROLES.includes(role);
}

export function canWriteCustomerData(role: UserRole) {
  return CUSTOMER_WRITE_ROLES.includes(role);
}
