<script setup lang="ts">
import NavigationButton from "~/components/Buttons/NavigationButton.vue"
import charterPlaceholder from "~/assets/images/charter-ai-placeholder.png"
import personsPlaceholder from "~/assets/images/persons-ai-placeholder.png"
import mapPlaceholder from "~/assets/images/map-ai-placeholder.png"

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
            <NavigationButton text="Charters" to="/charters" :img="charterPlaceholder" :count="catalog?.length ?? 0" />
            <NavigationButton
                text="Persons"
                to="/persons"
                :img="personsPlaceholder"
                :count="Object.keys(persons ?? {}).length"
            />
            <NavigationButton
                text="Map"
                to="/map"
                :img="mapPlaceholder"
                :count="Object.values(places ?? {}).filter((p) => p.coords).length"
            />
        </nav>
    </div>
</template>
