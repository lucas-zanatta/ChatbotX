import timezones from "timezones-list"
import {
  continents,
  countries,
  languages,
  type TContinentCode,
  type TCountryCode,
  type TLanguageCode,
} from "countries-list"

export const timezoneSelectOptions = timezones.map((v) => {
  return {
    value: v.utc,
    label: v.label,
  }
})

export const continentSelectOptions = (
  Object.keys(continents) as TContinentCode[]
).map((v) => {
  return {
    value: v,
    label: continents[v],
  }
})

export const languageSelectOptions = (
  Object.keys(languages) as TLanguageCode[]
).map((v) => {
  return {
    value: v,
    label: languages[v].name,
  }
})

export const supportedLanguageSelectOptions = [
  {
    value: "en",
    label: "English",
  },
  {
    value: "vi",
    label: "Tiếng Việt",
  },
]

export const countrySelectOptions = (
  Object.keys(countries) as TCountryCode[]
).map((v) => {
  return {
    value: v,
    label: countries[v].name,
  }
})
countrySelectOptions.unshift({
  value: "unknown" as TCountryCode,
  label: "UNKNOWN",
})

export const genderSelectOptions = [
  {
    value: "female",
    label: "Female",
  },
  {
    value: "male",
    label: "Male",
  },
  {
    value: "unknown",
    label: "Unknown",
  },
]
