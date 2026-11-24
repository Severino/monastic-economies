<script setup lang="ts">
const { data: catalog } = await useCatalog()
const { data: persons } = await usePersons()
const { data: places } = await usePlaces()
</script>

<template>
    <div class="container home">
        <h1>Monastic Economies</h1>
        <p class="lead">
            Placeholder for the project introduction (text will be supplied). Charters from the cartularies of Fulda and
            Farfa, with transcriptions, persons, places and legal actions.
        </p>
        <nav class="entry-points">
            <NuxtLink to="/charters" class="entry">
                <strong>Charters</strong><span>{{ catalog?.length ?? 0 }} charters, searchable and filterable</span>
            </NuxtLink>
            <NuxtLink to="/persons" class="entry">
                <strong>Persons</strong><span>{{ Object.keys(persons ?? {}).length }} persons</span>
            </NuxtLink>
            <NuxtLink to="/map" class="entry">
                <strong>Map</strong><span>{{Object.values(places ?? {}).filter((p) => p.coords).length}} located
                    places (coming next)</span>
            </NuxtLink>
        </nav>
    </div>
</template>
