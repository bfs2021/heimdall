import React from 'react'
import { type BaseGraphNodeComponentProps } from './GraphCanvas'
import './GraphNode.css'

export interface GraphNodeProps extends BaseGraphNodeComponentProps, Omit<React.HTMLAttributes<HTMLDivElement>, 'id' | 'onSelect' | 'onFocus' | 'onBlur'> {
  kind?: string
  domainColor?: string
  /** Whether this node has structural children. When true and onToggleCollapse is set, the node becomes focusable and Shift+Enter triggers collapse. */
  hasChildren?: boolean
  /** Whether this node's children are currently collapsed. */
  collapsed?: boolean
  /** Count of structural descendants currently hidden because this node is collapsed. */
  hiddenDescendantCount?: number
  /** Activates collapse/expand via Shift+Enter keyboard input. Omit to disable keyboard-driven collapse. */
  onToggleCollapse?: () => void
  /** Whether the node's popover is currently open. */
  popoverOpen?: boolean
  /** ID of the popover panel for aria-controls. */
  popoverPanelId?: string
  /** ID of the tooltip for aria-describedby when the tooltip is shown for this node. */
  tooltipId?: string
  /** Called when the node receives focus. */
  onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void
  /** Called when the node loses focus. */
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void
  /**
   * Renders the node as a round body of this radius (px) instead of a card — GraphCanvas's
   * default for layout="galaxy", where body area encodes the node's weight. The label sits
   * inside the body and is visually hidden (still announced, and shown on hover via `title`)
   * when the body is too small to hold it. Selection, keyboard, popover and collapse behave
   * exactly as on a card.
   */
  bodyRadius?: number
}

/** Bodies narrower than this (px) don't show their label inline (vision item 9: a body too small
 *  for a legible label shows none at full view; hover/selection still name it). 28px gave labels
 *  cut to fragments like "Gra ph…". */
const MIN_LABELED_BODY_DIAMETER = 44

export const GraphNode = React.forwardRef<HTMLDivElement, GraphNodeProps>(
  (
    {
      id,
      label,
      kind,
      domainColor = 'default',
      selected = false,
      onSelect,
      hasChildren = false,
      collapsed = false,
      hiddenDescendantCount = 0,
      onToggleCollapse,
      onPopoverOpen,
      popoverOpen = false,
      popoverPanelId,
      tooltipId,
      onFocus,
      onBlur,
      className = '',
      style: _style,
      bodyRadius,
      ...props
    },
    ref
  ) => {
    const isBody = bodyRadius !== undefined && Number.isFinite(bodyRadius) && bodyRadius > 0
    const diameter = isBody ? 2 * bodyRadius : undefined
    const classNames = [
      'graph-node',
      isBody && 'graph-node--body',
      isBody && diameter! < MIN_LABELED_BODY_DIAMETER && 'graph-node--body-unlabeled',
      selected && 'selected',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div
        ref={ref}
        className={classNames}
        data-domain={domainColor}
        data-kind={kind}
        onClick={(e) => {
          e.stopPropagation()
          try { onSelect?.(id) } catch (err) { console.error('onSelect failed:', err) }
          try { onPopoverOpen?.(e.currentTarget as HTMLElement) } catch (err) { console.error('onPopoverOpen failed:', err) }
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if ((e.key === 'Enter' || e.key === ' ') && !e.shiftKey) {
            e.preventDefault()
            e.stopPropagation()
            try { onSelect?.(id) } catch (err) { console.error('onSelect failed:', err) }
            try { onPopoverOpen?.(e.currentTarget as HTMLElement) } catch (err) { console.error('onPopoverOpen failed:', err) }
          } else if (e.key === 'Enter' && e.shiftKey && hasChildren && onToggleCollapse) {
            e.preventDefault()
            e.stopPropagation()
            try { onToggleCollapse() } catch (err) { console.error('onToggleCollapse failed:', err) }
          }
        }}
        role={onSelect || onPopoverOpen || (hasChildren && onToggleCollapse) ? 'button' : undefined}
        tabIndex={onSelect || onPopoverOpen || (hasChildren && onToggleCollapse) ? 0 : undefined}
        aria-pressed={onSelect ? selected : undefined}
        aria-haspopup={onPopoverOpen ? 'dialog' : undefined}
        {...(onPopoverOpen && { 'aria-expanded': popoverOpen })}
        {...(onPopoverOpen && popoverPanelId && { 'aria-controls': popoverPanelId })}
        {...(tooltipId && { 'aria-describedby': tooltipId })}
        {...(isBody && { style: { width: diameter, height: diameter }, title: label })}
        {...props}
      >
        <span className="graph-node__swatch" />
        <span className="graph-node__label">{label}</span>
        {kind && <span className="graph-node__kind">{kind}</span>}
        {hasChildren && onToggleCollapse && (
          <button
            className="graph-node__collapse-toggle"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              try { onToggleCollapse() } catch (err) { console.error('onToggleCollapse failed:', err) }
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                e.preventDefault()
                e.stopPropagation()
                try { onToggleCollapse() } catch (err) { console.error('onToggleCollapse failed:', err) }
              }
            }}
            type="button"
            aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
            aria-expanded={!collapsed}
          >
            <svg className="graph-node__toggle-icon" viewBox="0 0 24 24" width="12" height="12">
              {collapsed ? (
                <polyline points="9 6 15 12 9 18" strokeWidth="1.75" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <polyline points="6 9 12 15 18 9" strokeWidth="1.75" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
            {collapsed && hiddenDescendantCount > 0 && (
              <span className="graph-node__hidden-badge">{hiddenDescendantCount}</span>
            )}
          </button>
        )}
      </div>
    )
  }
)

GraphNode.displayName = 'GraphNode'

export default GraphNode
