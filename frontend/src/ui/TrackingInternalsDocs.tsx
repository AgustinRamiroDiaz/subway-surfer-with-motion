import type { ReactElement, ReactNode } from 'react';
import { Button } from '@mantine/core';
import { useI18n } from '../app/i18n';

interface DocSection {
  eyebrow: string;
  title: string;
  body: ReactNode;
}

export function TrackingInternalsDocs(): ReactElement {
  const { t } = useI18n();
  const sections: DocSection[] = [
    {
      eyebrow: t('docs.client.eyebrow'),
      title: t('docs.client.title'),
      body: t('docs.client.body'),
    },
    {
      eyebrow: t('docs.local.eyebrow'),
      title: t('docs.local.title'),
      body: t('docs.local.body'),
    },
    {
      eyebrow: t('docs.python.eyebrow'),
      title: t('docs.python.title'),
      body: (
        <>
          {t('docs.python.beforeLink')}
          <a
            href="https://github.com/AgustinRamiroDiaz/webcam-motion-games/releases"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('docs.python.link')}
          </a>
          {t('docs.python.afterLink')}<code>./pose-tracker-server</code>{t('docs.python.afterCode')}
        </>
      ),
    },
    {
      eyebrow: t('docs.latency.eyebrow'),
      title: t('docs.latency.title'),
      body: t('docs.latency.body'),
    },
    {
      eyebrow: t('docs.privacy.eyebrow'),
      title: t('docs.privacy.title'),
      body: t('docs.privacy.body'),
    },
  ];

  return (
    <div className="docs-view" aria-label={t('docs.aria')}>
      <div className="docs-view-header">
        <div>
          <p className="eyebrow">{t('docs.eyebrow')}</p>
          <h2>{t('docs.title')}</h2>
          <p>{t('docs.intro')}</p>
        </div>
        <Button className="secondary-action" component="a" href="/" variant="default">
          {t('docs.back')}
        </Button>
      </div>

      <div className="docs-sections">
        {sections.map((section) => (
          <section className="docs-section" key={section.eyebrow}>
            <p className="eyebrow">{section.eyebrow}</p>
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
