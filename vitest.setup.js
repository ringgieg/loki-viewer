import { config } from '@vue/test-utils'

// Silence Element Plus component/directive resolution warnings in tests.
// We stub the most common components/directives used across the app.

function passthroughStub(name, tag = 'div') {
  return {
    name,
    template: `<${tag} class="${name}"><slot /></${tag}>`
  }
}

config.global.stubs = {
  ...(config.global.stubs || {}),

  ElIcon: passthroughStub('ElIcon', 'i'),
  'el-icon': passthroughStub('ElIcon', 'i'),

  ElButton: {
    name: 'ElButton',
    props: ['type', 'size', 'loading', 'disabled', 'text', 'plain', 'link'],
    emits: ['click'],
    template: '<button class="el-button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
  },
  'el-button': {
    name: 'ElButton',
    props: ['type', 'size', 'loading', 'disabled', 'text', 'plain', 'link'],
    emits: ['click'],
    template: '<button class="el-button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
  },

  ElSelect: {
    name: 'ElSelect',
    props: ['modelValue', 'placeholder', 'size', 'style'],
    emits: ['update:modelValue', 'change'],
    template: '<select class="el-select"><slot /></select>'
  },
  'el-select': {
    name: 'ElSelect',
    props: ['modelValue', 'placeholder', 'size', 'style'],
    emits: ['update:modelValue', 'change'],
    template: '<select class="el-select"><slot /></select>'
  },

  ElOption: {
    name: 'ElOption',
    props: ['label', 'value'],
    template: '<option :value="value"><slot /></option>'
  },
  'el-option': {
    name: 'ElOption',
    props: ['label', 'value'],
    template: '<option :value="value"><slot /></option>'
  },

  ElDropdown: passthroughStub('ElDropdown'),
  'el-dropdown': passthroughStub('ElDropdown'),
  ElDropdownMenu: passthroughStub('ElDropdownMenu'),
  'el-dropdown-menu': passthroughStub('ElDropdownMenu'),
  ElDropdownItem: passthroughStub('ElDropdownItem'),
  'el-dropdown-item': passthroughStub('ElDropdownItem'),

  ElTag: passthroughStub('ElTag', 'span'),
  'el-tag': passthroughStub('ElTag', 'span'),
  ElTooltip: passthroughStub('ElTooltip', 'span'),
  'el-tooltip': passthroughStub('ElTooltip', 'span'),
  ElPopover: passthroughStub('ElPopover', 'span'),
  'el-popover': passthroughStub('ElPopover', 'span'),
  ElBadge: passthroughStub('ElBadge', 'span'),
  'el-badge': passthroughStub('ElBadge', 'span'),

  // Backwards compatibility: keep existing kebab-case stubs if referenced elsewhere
  // (explicit definitions above take precedence)

  // Deprecated old entries (left here only if already in config.global.stubs)
  // are overridden by the definitions above.

  // Legacy single entries (no longer needed)
  // 'el-icon': ...
  // 'el-button': ...

  // (Intentionally no-op)

  // ---
}

config.global.directives = {
  ...(config.global.directives || {}),

  // Element Plus v-loading
  loading: () => {
    // no-op
  }
}
