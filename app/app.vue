<template>
    <div class="app">
        <header class="site-header">
            <NuxtLink to="/" class="brand">Monastic Economies</NuxtLink>
            <nav>
                <NuxtLink to="/charters">Charters</NuxtLink>
                <NuxtLink to="/persons">Persons</NuxtLink>
                <NuxtLink to="/map">Map</NuxtLink>
            </nav>
            <div class="header-actions">
                <ThemeToggle />
            </div>
        </header>
        <main>
            <NuxtPage />
        </main>
    </div>
</template>
