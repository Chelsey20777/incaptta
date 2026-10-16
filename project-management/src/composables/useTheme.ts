import { ref, watchEffect } from 'vue'
import { useLocalStorage } from '@vueuse/core'

export type ThemeMode = 'light' | 'dark'
export type ColorTheme = 'default' | 'midnight' | 'nordic' | 'emerald' | 'new-emarald' | 'charcoal' | 'red' | 'orange' | 'green' | 'nature'

export function useTheme() {
    const mode = useLocalStorage<ThemeMode>('app-theme-mode', 'light')
    const colorTheme = useLocalStorage<ColorTheme>('app-color-theme', 'default')

    watchEffect(() => {
        const html = document.documentElement

        // Handle mode (light/dark)
        if (mode.value === 'dark') {
            html.classList.add('dark')
        } else {
            html.classList.remove('dark')
        }

        // Handle color themes
        // Remove all existing theme classes
        const themeClasses = ['theme-midnight', 'theme-nordic', 'theme-emerald', 'theme-new-emarald', 'theme-charcoal', 'theme-red', 'theme-orange', 'theme-green', 'theme-nature']
        html.classList.remove(...themeClasses)

        // Add selected theme class
        if (colorTheme.value !== 'default') {
            html.classList.add(`theme-${colorTheme.value}`)
        }
    })

    const setTheme = (newMode: ThemeMode, newColor?: ColorTheme) => {
        mode.value = newMode
        if (newColor) {
            colorTheme.value = newColor
        } else if (newMode === 'light') {
            colorTheme.value = 'default'
        }
    }

    return {
        mode,
        colorTheme,
        setTheme
    }
}
