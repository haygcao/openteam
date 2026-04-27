import { describe, expect, it } from 'vitest'
import { assertRoleDeliveryResponse } from './deliveryResponse'

describe('assertRoleDeliveryResponse', () => {
  it('accepts an ok response from the role tab', () => {
    expect(() => assertRoleDeliveryResponse({ ok: true, messageId: 'msg-1' })).not.toThrow()
  })

  it('throws when the role tab reports a prompt send failure', () => {
    expect(() => assertRoleDeliveryResponse({ ok: false, error: 'Gemini editor not found' })).toThrow(
      'Gemini editor not found',
    )
  })

  it('throws when the role tab returns no structured response', () => {
    expect(() => assertRoleDeliveryResponse(undefined)).toThrow('Role tab did not acknowledge the prompt')
  })
})
