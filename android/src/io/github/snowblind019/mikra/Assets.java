package io.github.snowblind019.mikra;

/** The files in web/ (inside the APK on the phone, a folder on the desktop). */
interface Assets {
    /** The file's bytes, or null when there is no such file. rel is already checked: no "..", no backslashes. */
    byte[] read(String rel);
}
