'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { StudioSidebar, TabType } from '@/components/h3/sidebar'
import { GenerateView } from '@/components/h3/generate-view'
import { GalleryView } from '@/components/h3/gallery-view'
import { QueueIndicator } from '@/components/queue-indicator'
import { SettingsDialog } from '@/components/h3/settings-dialog'
import { ModelsWarningBanner } from '@/components/h3/models-warning-banner'

const TAB_CONTENT = {
  generate: GenerateView,
  gallery: GalleryView,
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('generate')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Cross-component navigation (e.g. MetaDialog's "→ В редактор" button)
  useEffect(() => {
    const gotoGenerate = () => setActiveTab('generate')
    window.addEventListener('h3:goto-generate', gotoGenerate)
    return () => window.removeEventListener('h3:goto-generate', gotoGenerate)
  }, [])

  const ContentComponent = TAB_CONTENT[activeTab]

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Sidebar */}
      <StudioSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main Content */}
      <main className="flex-1 min-w-0 relative flex flex-col">
        {/* Models not downloaded warning */}
        <ModelsWarningBanner onOpenSettings={() => setSettingsOpen(true)} />

        <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="h-full flex"
          >
            <ContentComponent />
          </motion.div>
        </AnimatePresence>
        </div>

        {/* Queue indicator — bottom-right floating */}
        <QueueIndicator />
      </main>

      {/* Settings dialog (connection, GPU memory) — opened from the sidebar */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

    </div>
  )
}
