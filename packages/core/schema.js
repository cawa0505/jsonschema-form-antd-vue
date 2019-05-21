import _ from 'lodash'
import extend from 'extend'
import objectpath from 'objectpath'
import rule from './rule'
import defaultRule from './rules/default'
import arrayRule from './rules/array'
import switchRule from './rules/switch'
import checkboxesRule from './rules/checkboxes'
import dateRule from './rules/date'
import fieldsetRule from './rules/fieldset'
import numberRule from './rules/number'
import selectRule from './rules/select'
import textRule from './rules/text'
import imageUploadRule from './rules/image-upload'

const rulesMap = {
  switch: switchRule,
  fieldset: fieldsetRule,
  checkboxes: checkboxesRule,
  array: arrayRule,
  number: numberRule,
  date: dateRule,
  select: selectRule,
  text: textRule,
  image: imageUploadRule
}

// const BUILD_IN_TYPE = {
//   'text': 'a-input',
//   'select': 'a-select',
//   'textarea': 'a-input',
//   'html',
//   'grid',
//   'fieldset'
// }

class Generator {
  constructor () {
    this.rules = {}
    this.init()
  }

  init () {
    const rules = {}

    _.each(rule, (list, type) => {
      rules[type] = list.map(item => {
        return rulesMap[item]
      })
    })

    this.rules = rules
  }

  /**
   * 给指定类型添加规则
   * @param {String} type data type
   * @param {Function} rule 规则
   * @param {Number} idx 添加位置，不提供则是添加到第一位
   */
  addRule (type, rule, idx = 0) {
    const rules = this.rules[type]

    if (!rules) {
      this.rules[type] = [ rule ]
      // throw new Error(`不支持的类型: ${type}`)
    } else {
      rules.splice(idx, 0, rule)
    }
  }

  /**
   * 生成表单模型
   * @param {Object} schema
   * @param {Array} definition
   */
  parse (schema, definition = [], formItemProps, handleFieldValidate) {
    if (!schema || !(schema.properties || schema.items)) {
      throw new Error('schema no validate!')
    }

    this.handleFieldValidate = handleFieldValidate
    this.formItemProps = formItemProps

    const options = { path: [], lookup: {} }
    const schemaForm = []

    if (schema.properties) {
      _.each(schema.properties, (val, key) => {
        const required = schema.required && _.indexOf(schema.required, key) !== -1

        this._parse(key, val, schemaForm, {
          path: [key],
          required: required,
          lookup: options.lookup
        })
      })
    } else {
      _.each(schema.items, (val, idx) => {
        this._parse(idx, val, schemaForm, {
          path: [idx],
          lookup: options.lookup,
          parentType: 'array'
        })
      })
    }

    // 再根据form definition合并form schema
    if (definition.length) {
      definition = combine.call(this, definition, schemaForm, options.lookup)
    } else {
      definition = schemaForm
    }

    return definition
  }

  /**
   * 生成表单模型
   * @param {Object} schema
   * @param {Array} definition
   */
  _parse (name, schema, definition, options) {
    const rules = this.rules[schema.type]
    let def

    if (rules) {
      def = defaultRule(name, schema, options, this.formItemProps)

      for (let i = 0, len = rules.length; i < len; i++) {
        rules[i].call(this, def, schema, options)

        if (def.type) {
          break
        }
      }
    }

    definition.push(def)
  }
}

// 合并form definition & schemaForm
function combine (form, schemaForm, lookup) {
  const idx = _.indexOf(form, '*')

  // 用schema生成的默认定义
  if (idx === 0) {
    return schemaForm
  }

  // Important: 存在*就意味着使用schema生成的默认定义，只是在前后做一定的扩展，如果此时存在同名定义，就会存在两个定义。
  if (idx > -1) {
    form.splice(idx, 1)
  }

  const definition = []

  _.each(form, obj => {
    if (typeof obj === 'string') {
      obj = {
        key: obj
      }
    }

    if (obj.key && typeof obj.key === 'string') {
      obj.key = obj.key.replace(/\[\]/g, '[0].')
      obj.key = objectpath.parse(obj.key)
    }

    // 兼容jsonschema-form-vue definition格式
    obj = compatOldVersion(obj)

    // if (def.options) {
    //   def.options = formatOptions(obj.options)
    // }
    let def

    // extend with schema form from schema
    if (obj.key) {
      const path = objectpath.stringify(obj.key)
      def = lookup[path]

      if (def) {
        // 当类型不相等，要处理，获取正确def
        if (def.type !== obj.type) {
          const rule = this.rules[obj.type]

          if (rule) {
            def = {
              formItem: def.formItem,
              key: def.key,
              col: def.col,
              schema: def.schema
            }

            rule[0].call(this, def, def.schema)
            obj.type = def.type
          }
        }

        obj = extend(true, {}, def, obj)

        // wrapper col span
        if (def.formItem.label !== obj.formItem.label && (def.formItem.label === '' || obj.formItem.label === '')) {
          if (def.formItem.label === '') {
            obj.formItem.wrapperCol.span = obj.formItem.wrapperCol.span - obj.formItem.labelCol.span - obj.formItem.labelCol.offset
          } else {
            obj.formItem.wrapperCol.span = obj.formItem.wrapperCol.span + obj.formItem.labelCol.span + obj.formItem.labelCol.offset
          }
        }

        delete obj.schema
      } else {
        const rule = this.rules[obj.type]

        if (rule) {
          def = {
            formItem: {
              ...this.formItemProps
            }
          }

          rule[0].call(this, def)
          obj.type = def.type
          obj = extend(true, {}, def, obj)
        }
      }

      delete lookup[path]
    }

    if (obj.items) {
      if (def) {
        obj.items = combine(obj.items, def.items, lookup)
      } else {
        obj.items = combine(obj.items, schemaForm, lookup)
      }
    }

    definition.push(obj)
  })

  if (idx > -1 && !_.isEmpty(lookup)) {
    const defaultDefinitions = []

    for (let path in lookup) {
      defaultDefinitions.push(lookup[path])
    }

    definition.splice(idx, 0, ...defaultDefinitions)
  }

  return definition
}

// 兼容jsonschema-form-vue definition结构
function compatOldVersion (data) {
  let def = extend(true, {}, data)
  let obj = {
    type: def.type,
    key: def.key
  }
  delete def.type
  delete def.key
  let formItem = {}
  let input = {}

  if (typeof def.title !== 'undefined') {
    formItem.label = def.title
    delete def.title
  }

  if (def.description) {
    formItem.help = def.description
    delete def.description
  }

  if (def.col) {
    obj.col = def.col
    delete def.col
  }

  if (def.tpl) {
    input.html = def.tpl
    delete def.tpl
  }

  formItem = extend(true, {}, formItem, def.formItem)
  delete def.formItem
  input = extend(true, {}, input, def.input)
  delete def.formItem

  input = {
    ...input,
    ...def
  }

  obj.formItem = formItem
  obj.input = input

  return obj
}

export default Generator
