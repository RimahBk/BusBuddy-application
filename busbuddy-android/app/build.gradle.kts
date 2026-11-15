import java.util.Properties

plugins {
    id("com.android.application")
}

// Release signing key. The passwords live in keystore.properties (NOT in git).
// If that file is missing, release builds are simply left unsigned.
val keystoreFile = rootProject.file("keystore.properties")
val keystore = Properties().apply { if (keystoreFile.exists()) keystoreFile.inputStream().use { load(it) } }

android {
    namespace = "com.busbuddy.webview"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.busbuddy.webview"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        if (keystoreFile.exists()) {
            create("release") {
                storeFile = rootProject.file(keystore.getProperty("storeFile"))
                storePassword = keystore.getProperty("storePassword")
                keyAlias = keystore.getProperty("keyAlias")
                keyPassword = keystore.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystoreFile.exists()) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.webkit:webkit:1.18.0")   // WebViewAssetLoader: serves the website from the app's assets
}

// ---------------------------------------------------------------------
// The website is NOT copied into this project by hand.
// On every build this task copies the pages, css/ and js/ from
// ../busbuddy-web into the app's assets as www/, so the app always
// contains the current version of the site.
// (api/, supabase/, README etc. are not needed inside the app.)
// ---------------------------------------------------------------------
abstract class CopyWebsite : DefaultTask() {
    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val websiteDir: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val fs: FileSystemOperations

    @TaskAction
    fun copy() {
        fs.sync {
            from(websiteDir) {
                include("*.html", "css/**", "js/**")
            }
            into(outputDir.dir("www"))
        }
    }
}

val copyWebsite = tasks.register<CopyWebsite>("copyWebsite") {
    websiteDir.set(rootProject.layout.projectDirectory.dir("../busbuddy-web"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyWebsite, CopyWebsite::outputDir)
    }
}
