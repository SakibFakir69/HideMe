package expo.modules.appicon

import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Launcher-icon disguise controller.
 *
 * Android allows several `activity-alias` entries to target the same activity.
 * Toggling their enabled state changes the launcher label and icon without
 * reinstalling. `DONT_KILL_APP` keeps the current session alive, which matters
 * because the vault must stay unlocked while the user browses the launcher.
 */
class AppIconModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AppIcon")

    Function("isSupported") {
      val context = appContext.reactContext ?: return@Function false
      aliasesDeclared(context)
    }

    Function("getActiveIcon") {
      val context = appContext.reactContext ?: return@Function LauncherAliases.HIDDEN
      activeId(context)
    }

    Function("setActiveIcon") { id: String ->
      val context = appContext.reactContext ?: return@Function false
      if (!aliasesDeclared(context)) return@Function false
      if (id != LauncherAliases.HIDDEN && LauncherAliases.byId(id) == null) return@Function false

      val pm = context.packageManager
      for (disguise in LauncherAliases.ALL) {
        val enabled = id == disguise.id
        pm.setComponentEnabledSetting(
          LauncherAliases.component(context, disguise.alias),
          if (enabled) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
          } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
          },
          PackageManager.DONT_KILL_APP,
        )
      }
      true
    }
  }

  /** Aliases only exist once the config plugin has been applied. */
  private fun aliasesDeclared(context: Context): Boolean {
    return try {
      context.packageManager.getActivityInfo(
        LauncherAliases.component(context, LauncherAliases.DEFAULT.alias),
        0,
      )
      true
    } catch (e: PackageManager.NameNotFoundException) {
      false
    }
  }

  private fun activeId(context: Context): String {
    if (!aliasesDeclared(context)) return LauncherAliases.HIDDEN
    val pm = context.packageManager
    for (disguise in LauncherAliases.ALL) {
      val state = pm.getComponentEnabledSetting(LauncherAliases.component(context, disguise.alias))
      if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) return disguise.id
    }
    // Untouched state means the manifest default (Calculator) is in effect.
    val defaultState = pm.getComponentEnabledSetting(
      LauncherAliases.component(context, LauncherAliases.DEFAULT.alias),
    )
    if (defaultState == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return LauncherAliases.DEFAULT.id
    return LauncherAliases.HIDDEN
  }
}
