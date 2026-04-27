// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { keepDeepestResponseContainers } from './responseContainers'

describe('keepDeepestResponseContainers', () => {
  it('keeps the inner reply container when Gemini reports both outer and inner nodes', () => {
    document.body.innerHTML = `
      <model-response id="outer">
        <message-content id="inner">你好</message-content>
      </model-response>
    `
    const outer = document.getElementById('outer')!
    const inner = document.getElementById('inner')!

    expect(keepDeepestResponseContainers([outer, inner])).toEqual([inner])
  })

  it('keeps separate sibling replies', () => {
    document.body.innerHTML = `
      <message-content id="first">第一条</message-content>
      <message-content id="second">第二条</message-content>
    `
    const first = document.getElementById('first')!
    const second = document.getElementById('second')!

    expect(keepDeepestResponseContainers([first, second])).toEqual([first, second])
  })
})
