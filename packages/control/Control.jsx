import FormMixin from '../mixins'

const Control = {
  name: 'JControl',
  mixins: [ FormMixin ],
  render (h) {
    const { path, definition } = this
    const component = definition.type
    const groupProps = {
      props: definition.formItem
    }
    const inputProps = {
      props: {
        ...definition.input,
        path: this.getPath(path)
      }
    }

    if (definition.decorator) {
      const id = this.getDecoratorId(path)
      const decorator = [id].concat(definition.decorator)
      inputProps.directives = [
        {
          name: 'decorator',
          value: decorator
        }
      ]

      return (
        <a-form-item { ...groupProps }>
          { h(component, inputProps) }
        </a-form-item>
      )
    } else {
      if (definition.formItem && definition.formItem.label) {
        return (
          <a-form-item { ...groupProps }>
            { h(component, inputProps) }
          </a-form-item>
        )
      } else {
        return h(component, inputProps)
      }
    }
  }
}

export default Control
