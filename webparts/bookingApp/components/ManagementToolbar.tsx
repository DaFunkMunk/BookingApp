import * as React from 'react';
import styles from './BookingApp.module.scss';
import { useCapabilities } from '../services/capabilityContext';

type ToolbarAction = {
  capability: string;
  label: string;
  variant: 'primary' | 'ghost';
};

const PRIMARY_ACTIONS: ToolbarAction[] = [
  { capability: 'event:create', label: 'Schedule Manager', variant: 'primary' },
  { capability: 'user:manage', label: 'Manage Users', variant: 'ghost' },
  { capability: 'appearance:update', label: 'Appearance', variant: 'ghost' },
  { capability: 'reports:view', label: 'Reports', variant: 'ghost' },
];

const SECONDARY_ACTIONS: ToolbarAction[] = [
  { capability: 'notify:bulk', label: 'Bulk Notify', variant: 'ghost' },
  { capability: 'automation:manage', label: 'Automations', variant: 'ghost' },
  { capability: 'waitlist:manage', label: 'Waitlist', variant: 'ghost' },
  { capability: 'audit:view', label: 'Audit Log', variant: 'ghost' },
  { capability: 'dependencies:manage', label: 'Dependencies', variant: 'ghost' },
];

const noop = (label: string) => () => {
  // placeholder handler for future implementation
  // eslint-disable-next-line no-console
  console.info(`[RBAC] '${label}' triggered - wire up handler when feature is implemented.`);
};

type ManagementToolbarProps = {
  className?: string;
  onAction?: (capability: string, label: string) => void;
};

const ManagementToolbar = ({ className, onAction }: ManagementToolbarProps): JSX.Element | null => {
  const { hasCapability } = useCapabilities();

  const visiblePrimary = React.useMemo(
    () => PRIMARY_ACTIONS.filter((action) => hasCapability(action.capability)),
    [hasCapability]
  );

  const visibleSecondary = React.useMemo(
    () => SECONDARY_ACTIONS.filter((action) => hasCapability(action.capability)),
    [hasCapability]
  );

  if (visiblePrimary.length === 0 && visibleSecondary.length === 0) {
    return null;
  }

  const renderRow = (actions: ToolbarAction[], secondary?: boolean) => (
    <div className={`${styles.toolbarRow} ${secondary ? styles.secondaryToolbarRow : ''}`}>
      {actions.map((action) => {
        const baseClass =
          action.variant === 'primary' ? styles.btnPrimary : styles.btnGhost;
        const handleClick = () => {
          if (onAction) {
            onAction(action.capability, action.label);
          } else {
            noop(action.label)();
          }
        };
        return (
          <button
            key={action.capability}
            type="button"
            className={`${baseClass} ${styles.toolbarButton}`}
            onClick={handleClick}
            title="Feature scaffolding complete - wire up action when ready."
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );

  const rootClassName = className
    ? `${styles.managementToolbar} ${className}`.trim()
    : styles.managementToolbar;

  return (
    <div className={rootClassName}>
      {visiblePrimary.length > 0 && renderRow(visiblePrimary)}
      {visibleSecondary.length > 0 && renderRow(visibleSecondary, true)}
    </div>
  );
};

export default ManagementToolbar;
