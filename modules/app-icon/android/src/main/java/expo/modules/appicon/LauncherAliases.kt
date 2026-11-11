package expo.modules.appicon

import android.content.ComponentName
import android.content.Context

/**
 * The launcher disguises declared as `activity-alias` entries in the app
 * manifest (added by `plugins/with-launcher-disguise.js`).
 *
 * Exactly one alias is enabled at a time; "hidden" means all of them are
 * disabled and the app has no launcher entry at all. The real activity stays
 * enabled so the running app is never killed by a switch.
 */
internal object LauncherAliases {
  const val HIDDEN = "hidden"

  data class Disguise(val id: String, val alias: String, val label: String)

  val ALL = listOf(
    Disguise("calculator", "CalculatorAlias", "Calculator"),
    Disguise("notes", "NotesAlias", "Notes"),
    Disguise("photos", "PhotosAlias", "Photos"),
    Disguise("weather", "WeatherAlias", "Weather"),
    Disguise("music", "MusicAlias", "Music"),
  )

  val DEFAULT = ALL.first()

  fun component(context: Context, alias: String): ComponentName =
    ComponentName(context, "${context.packageName}.$alias")

  fun byId(id: String): Disguise? = ALL.firstOrNull { it.id == id }
}
