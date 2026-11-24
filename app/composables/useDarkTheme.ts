/**
 * Whether the dark theme is active: the stored choice (`data-theme` on <html>,
 * set by ThemeToggle) or else the system preference. Only meaningful after
 * mount; during SSR it is `false`.
 */
export function useDarkTheme() {
    const dark = ref(false)
    let media: MediaQueryList | undefined
    let observer: MutationObserver | undefined

    function sync() {
        const forced = document.documentElement.dataset.theme
        dark.value = forced ? forced === "dark" : (media?.matches ?? false)
    }

    onMounted(() => {
        media = window.matchMedia("(prefers-color-scheme: dark)")
        media.addEventListener("change", sync)
        observer = new MutationObserver(sync)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
        sync()
    })
    onBeforeUnmount(() => {
        media?.removeEventListener("change", sync)
        observer?.disconnect()
    })
    return dark
}
