import { describe, expect, it } from 'vitest'
import { BUILTIN_GROUP_TEMPLATES, getBuiltinGroupTemplate } from './builtinGroupTemplates'

describe('built-in group templates', () => {
  it('offers ready-made groups across common industries and workflows', () => {
    expect(BUILTIN_GROUP_TEMPLATES.map(template => template.name)).toEqual([
      '产品研发小组',
      '内容运营小组',
      '电商经营小组',
      '教育课程小组',
      '法务合规小组',
      '财务经营小组',
      '投资研究小组',
      'HR 招聘小组',
      '门店经营小组',
      '制造供应链小组',
      '医疗健康科普小组',
      '公益政务项目小组',
    ])
  })

  it('defines complete reusable people for every group', () => {
    const ids = new Set<string>()

    for (const template of BUILTIN_GROUP_TEMPLATES) {
      expect(ids.has(template.id), template.id).toBe(false)
      ids.add(template.id)
      expect(template.defaultChatName.trim().length, template.id).toBeGreaterThan(0)
      expect(template.summary.trim().length, template.id).toBeGreaterThan(8)
      expect(template.roles.length, template.id).toBeGreaterThanOrEqual(3)
      expect(template.roles.length, template.id).toBeLessThanOrEqual(6)

      const roleNames = new Set<string>()
      for (const role of template.roles) {
        expect(roleNames.has(role.name), `${template.id}:${role.name}`).toBe(false)
        roleNames.add(role.name)
        expect(role.description.trim().length, `${template.id}:${role.name}`).toBeGreaterThan(8)
        expect(role.systemPrompt.trim().length, `${template.id}:${role.name}`).toBeGreaterThan(24)
      }
    }
  })

  it('can look up templates by stable id', () => {
    expect(getBuiltinGroupTemplate('product-development')?.name).toBe('产品研发小组')
    expect(getBuiltinGroupTemplate('missing-template')).toBeUndefined()
  })
})
