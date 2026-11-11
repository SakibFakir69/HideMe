package expo.modules.appicon

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.telephony.TelephonyManager
import android.widget.Toast

/**
 * Dial `*#*#48263#*#*` to bring the launcher icon back after it was hidden.
 * This is the only way in when every alias is disabled, so the receiver must
 * stay enabled and exported.
 */
class SecretCodeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != TelephonyManager.ACTION_SECRET_CODE) return
    if (intent.data?.host != SECRET_CODE) return

    val pm = context.packageManager
    try {
      pm.getActivityInfo(
        LauncherAliases.component(context, LauncherAliases.DEFAULT.alias),
        0,
      )
    } catch (e: PackageManager.NameNotFoundException) {
      return
    }

    for (disguise in LauncherAliases.ALL) {
      pm.setComponentEnabledSetting(
        LauncherAliases.component(context, disguise.alias),
        if (disguise.id == LauncherAliases.DEFAULT.id) {
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        },
        PackageManager.DONT_KILL_APP,
      )
    }

    Toast.makeText(context, "Launcher icon restored", Toast.LENGTH_SHORT).show()
  }

  companion object {
    const val SECRET_CODE = "48263"
  }
}
