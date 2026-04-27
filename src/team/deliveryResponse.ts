interface RoleDeliveryResponse {
  ok?: boolean
  error?: string
}

export function assertRoleDeliveryResponse(response: unknown): void {
  const result = response as RoleDeliveryResponse | undefined
  if (!result) throw new Error('Role tab did not acknowledge the prompt')
  if (result.ok !== true) throw new Error(result.error || 'Role tab failed to send the prompt')
}
