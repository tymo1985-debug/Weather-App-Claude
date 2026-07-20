/**
 * i18n.js
 * ---------------------------------------------------------------------------
 * Interface language dictionary. Covers static UI chrome (titles, buttons,
 * labels) and the two content maps that recur everywhere (weather
 * descriptions, comfort-level labels).
 *
 * SCOPE / KNOWN LIMITATION: this does NOT cover every dynamically-generated
 * string in the app — the runner engine's per-hour "factors" (e.g. "высокий
 * риск перегрева"), the free-text clothing advice sentences, and the
 * share-card canvas text all stay in Russian regardless of the selected
 * language. Translating those would mean rewriting runner-engine.js's output
 * to return translation keys instead of finished sentences — a bigger
 * refactor than fits alongside everything else in this pass. Everything a
 * user looks at first (headers, buttons, section titles, weather
 * descriptions, comfort levels, units) is fully translated.
 */

export const LANGUAGES = ['ru', 'uk', 'de', 'en'];

export const LANGUAGE_NAMES = { ru: 'Русский', uk: 'Українська', de: 'Deutsch', en: 'English' };

const STRINGS = {
  ru: {
    sectionHourly: 'Почасовой прогноз',
    sectionDaily: 'Прогноз на 10 дней',
    sectionWeekly: 'Недельный тренд для бега',
    sectionDetails: 'Подробности',
    sectionChart: 'Температура, 24 часа',
    sectionRadar: 'Радар осадков',
    forRunner: 'Для бегуна',
    feelsLike: 'Ощущается как',
    updated: 'Обновлено в',
    myCities: 'Мои города',
    addCity: '＋ Добавить город',
    units: 'Единицы измерения',
    notificationsAndTraffic: 'Уведомления и трафик',
    customizeScreen: 'Настроить экран',
    interfaceLanguage: 'Язык интерфейса',
    weeklyTrendNote: 'Оценка по дневным максимумам/минимумам — для планирования длительной пробежки заранее, менее точная, чем почасовая шкала на сегодня.',
    footer: 'Данные: Open-Meteo · Обновляется автоматически',
    levelExcellent: 'Отличные условия для бега',
    levelGood: 'Хорошие условия',
    levelCaution: 'Бежать можно, но соблюдайте осторожность',
    levelPoor: 'Условия неблагоприятные',
    levelBad: 'Сегодня пробежку лучше перенести',
  },
  uk: {
    sectionHourly: 'Погодинний прогноз',
    sectionDaily: 'Прогноз на 10 днів',
    sectionWeekly: 'Тижневий тренд для бігу',
    sectionDetails: 'Подробиці',
    sectionChart: 'Температура, 24 години',
    sectionRadar: 'Радар опадів',
    forRunner: 'Для бігуна',
    feelsLike: 'Відчувається як',
    updated: 'Оновлено о',
    myCities: 'Мої міста',
    addCity: '＋ Додати місто',
    units: 'Одиниці виміру',
    notificationsAndTraffic: 'Сповіщення та трафік',
    customizeScreen: 'Налаштувати екран',
    interfaceLanguage: 'Мова інтерфейсу',
    weeklyTrendNote: 'Оцінка за денними максимумами/мінімумами — для планування довгого забігу заздалегідь, менш точна, ніж погодинна шкала на сьогодні.',
    footer: 'Дані: Open-Meteo · Оновлюється автоматично',
    levelExcellent: 'Відмінні умови для бігу',
    levelGood: 'Гарні умови',
    levelCaution: 'Бігати можна, але обережно',
    levelPoor: 'Умови несприятливі',
    levelBad: 'Сьогодні пробіжку краще перенести',
  },
  de: {
    sectionHourly: 'Stündliche Vorhersage',
    sectionDaily: '10-Tage-Vorhersage',
    sectionWeekly: 'Wochentrend fürs Laufen',
    sectionDetails: 'Details',
    sectionChart: 'Temperatur, 24 Stunden',
    sectionRadar: 'Niederschlagsradar',
    forRunner: 'Für Läufer',
    feelsLike: 'Gefühlt wie',
    updated: 'Aktualisiert um',
    myCities: 'Meine Städte',
    addCity: '＋ Stadt hinzufügen',
    units: 'Einheiten',
    notificationsAndTraffic: 'Benachrichtigungen & Datenverbrauch',
    customizeScreen: 'Bildschirm anpassen',
    interfaceLanguage: 'Oberflächensprache',
    weeklyTrendNote: 'Schätzung basierend auf Tageshöchst-/-tiefstwerten — zur Planung eines langen Laufs im Voraus, weniger genau als die stündliche Skala für heute.',
    footer: 'Daten: Open-Meteo · Automatische Aktualisierung',
    levelExcellent: 'Ausgezeichnete Laufbedingungen',
    levelGood: 'Gute Bedingungen',
    levelCaution: 'Laufen möglich, aber Vorsicht geboten',
    levelPoor: 'Ungünstige Bedingungen',
    levelBad: 'Lauf heute besser verschieben',
  },
  en: {
    sectionHourly: 'Hourly forecast',
    sectionDaily: '10-day forecast',
    sectionWeekly: 'Weekly running trend',
    sectionDetails: 'Details',
    sectionChart: 'Temperature, 24 hours',
    sectionRadar: 'Precipitation radar',
    forRunner: 'For runners',
    feelsLike: 'Feels like',
    updated: 'Updated at',
    myCities: 'My cities',
    addCity: '＋ Add city',
    units: 'Units',
    notificationsAndTraffic: 'Notifications & data usage',
    customizeScreen: 'Customize screen',
    interfaceLanguage: 'Interface language',
    weeklyTrendNote: 'Estimated from daily highs/lows — for planning a long run ahead of time, less precise than today\u2019s hourly scale.',
    footer: 'Data: Open-Meteo · Updates automatically',
    levelExcellent: 'Excellent running conditions',
    levelGood: 'Good conditions',
    levelCaution: 'You can run, but take care',
    levelPoor: 'Unfavorable conditions',
    levelBad: 'Better to reschedule today\u2019s run',
  },
};

const WEATHER_DESCRIPTIONS = {
  ru: {
    0: 'Ясно', 1: 'Преимущественно ясно', 2: 'Переменная облачность', 3: 'Пасмурно',
    45: 'Туман', 48: 'Изморозь', 51: 'Слабая морось', 53: 'Морось', 55: 'Сильная морось',
    56: 'Ледяная морось', 57: 'Сильная ледяная морось', 61: 'Небольшой дождь', 63: 'Дождь',
    65: 'Сильный дождь', 66: 'Ледяной дождь', 67: 'Сильный ледяной дождь', 71: 'Небольшой снег',
    73: 'Снег', 75: 'Сильный снег', 77: 'Снежная крупа', 80: 'Небольшой ливень', 81: 'Ливень',
    82: 'Сильный ливень', 85: 'Снегопад', 86: 'Сильный снегопад', 95: 'Гроза',
    96: 'Гроза с градом', 99: 'Сильная гроза с градом',
  },
  uk: {
    0: 'Ясно', 1: 'Переважно ясно', 2: 'Мінлива хмарність', 3: 'Хмарно',
    45: 'Туман', 48: 'Паморозь', 51: 'Слабка мряка', 53: 'Мряка', 55: 'Сильна мряка',
    56: 'Крижана мряка', 57: 'Сильна крижана мряка', 61: 'Невеликий дощ', 63: 'Дощ',
    65: 'Сильний дощ', 66: 'Крижаний дощ', 67: 'Сильний крижаний дощ', 71: 'Невеликий сніг',
    73: 'Сніг', 75: 'Сильний сніг', 77: 'Снігова крупа', 80: 'Невеликий злива', 81: 'Злива',
    82: 'Сильна злива', 85: 'Снігопад', 86: 'Сильний снігопад', 95: 'Гроза',
    96: 'Гроза з градом', 99: 'Сильна гроза з градом',
  },
  de: {
    0: 'Klar', 1: 'Überwiegend klar', 2: 'Teilweise bewölkt', 3: 'Bewölkt',
    45: 'Nebel', 48: 'Reifnebel', 51: 'Leichter Nieselregen', 53: 'Nieselregen', 55: 'Starker Nieselregen',
    56: 'Gefrierender Nieselregen', 57: 'Starker gefrierender Nieselregen', 61: 'Leichter Regen', 63: 'Regen',
    65: 'Starker Regen', 66: 'Gefrierender Regen', 67: 'Starker gefrierender Regen', 71: 'Leichter Schnee',
    73: 'Schnee', 75: 'Starker Schnee', 77: 'Schneegriesel', 80: 'Leichter Schauer', 81: 'Schauer',
    82: 'Starker Schauer', 85: 'Schneeschauer', 86: 'Starker Schneeschauer', 95: 'Gewitter',
    96: 'Gewitter mit Hagel', 99: 'Starkes Gewitter mit Hagel',
  },
  en: {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
    56: 'Freezing drizzle', 57: 'Dense freezing drizzle', 61: 'Slight rain', 63: 'Rain',
    65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain', 71: 'Slight snow',
    73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Slight showers', 81: 'Showers',
    82: 'Violent showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm',
    96: 'Thunderstorm with hail', 99: 'Severe thunderstorm with hail',
  },
};

const LEVEL_KEY_TO_STRING_KEY = {
  excellent: 'levelExcellent', good: 'levelGood', caution: 'levelCaution', poor: 'levelPoor', bad: 'levelBad',
};

/** Translates a static UI string key; falls back to Russian, then the key itself. */
export function t(key, lang = 'ru') {
  return STRINGS[lang]?.[key] ?? STRINGS.ru[key] ?? key;
}

/** Translated weather description for a WMO code, in the given language. */
export function translatedWeatherDescription(weatherCode, lang = 'ru') {
  return WEATHER_DESCRIPTIONS[lang]?.[weatherCode] ?? WEATHER_DESCRIPTIONS.ru[weatherCode] ?? '—';
}

/** Translated label for a runner-engine level key ('excellent'|'good'|'caution'|'poor'|'bad'). */
export function translatedLevelLabel(levelKey, lang = 'ru') {
  const stringKey = LEVEL_KEY_TO_STRING_KEY[levelKey];
  return stringKey ? t(stringKey, lang) : levelKey;
}
