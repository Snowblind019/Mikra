package io.github.snowblind019.mikra;

import android.database.Cursor;
import android.database.sqlite.SQLiteCursor;
import android.database.sqlite.SQLiteCursorDriver;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteQuery;

import java.util.ArrayList;
import java.util.List;

/** The database through Android's SQLite, read-only. Arguments are bound with their real types (numbers stay numbers). */
final class AndroidDb implements Db {
    private final SQLiteDatabase db;

    AndroidDb(String path) {
        // NO_LOCALIZED_COLLATORS: the file has no android_metadata table and doesn't need one
        db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS);
    }

    @Override public List<Object[]> query(String sql, final Object... args) {
        Cursor c = db.rawQueryWithFactory(new SQLiteDatabase.CursorFactory() {
            @Override public Cursor newCursor(SQLiteDatabase d, SQLiteCursorDriver driver, String editTable, SQLiteQuery query) {
                for (int i = 0; i < args.length; i++) {
                    Object a = args[i];
                    int idx = i + 1;
                    if (a == null) query.bindNull(idx);
                    else if (a instanceof Long || a instanceof Integer) query.bindLong(idx, ((Number) a).longValue());
                    else if (a instanceof Double) query.bindDouble(idx, (Double) a);
                    else if (a instanceof byte[]) query.bindBlob(idx, (byte[]) a);
                    else query.bindString(idx, a.toString());
                }
                return new SQLiteCursor(driver, editTable, query);
            }
        }, sql, null, null);
        try {
            int n = c.getColumnCount();
            List<Object[]> out = new ArrayList<Object[]>(Math.max(4, c.getCount()));
            while (c.moveToNext()) {
                Object[] row = new Object[n];
                for (int i = 0; i < n; i++) {
                    switch (c.getType(i)) {
                        case Cursor.FIELD_TYPE_NULL: row[i] = null; break;
                        case Cursor.FIELD_TYPE_INTEGER: row[i] = c.getLong(i); break;
                        case Cursor.FIELD_TYPE_FLOAT: row[i] = c.getDouble(i); break;
                        case Cursor.FIELD_TYPE_BLOB: row[i] = c.getBlob(i); break;
                        default: row[i] = c.getString(i);
                    }
                }
                out.add(row);
            }
            return out;
        } finally {
            c.close();
        }
    }
}
