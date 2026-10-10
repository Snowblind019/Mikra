package io.github.snowblind019.mikra;

import java.util.List;

/** Read-only access to data/mikra.db. Values come back as Long, Double, String, byte[] or null. */
interface Db {
    List<Object[]> query(String sql, Object... args);
}
