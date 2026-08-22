import { ActionIcon, Tooltip } from '@mantine/core';
import type { ReactElement } from 'react';
import { useI18n } from '../../app/i18n';

type ControlHelpLabelProps = {
  children: string;
  help: string;
};

export function ControlHelpLabel({ children, help }: ControlHelpLabelProps): ReactElement {
  const { t } = useI18n();

  return (
    <span className="control-label">
      <span>{children}</span>
      <Tooltip label={help} multiline withArrow position="top" className="control-tooltip">
        <ActionIcon
          aria-label={t('controls.about', { label: children })}
          className="tooltip-trigger"
          radius="xl"
          size="xs"
          variant="subtle"
        >
          ?
        </ActionIcon>
      </Tooltip>
    </span>
  );
}
