package io.github.snowblind019.mikra;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

/** Desktop test harness only: the same database through JDBC, so the Java server can be tested without a phone. */
final class JdbcDb implements Db {
    private final Connection conn;

    JdbcDb(String path) throws SQLException {
        conn = DriverManager.getConnection("jdbc:sqlite:" + path);
        Statement st = conn.createStatement();
        st.execute("PRAGMA query_only=1");
        st.close();
    }

    @Override public synchronized List<Object[]> query(String sql, Object... args) {
        try {
            PreparedStatement ps = conn.prepareStatement(sql);
            try {
                for (int i = 0; i < args.length; i++) {
                    Object a = args[i];
                    if (a == null) ps.setNull(i + 1, java.sql.Types.NULL);
                    else if (a instanceof Long || a instanceof Integer) ps.setLong(i + 1, ((Number) a).longValue());
                    else if (a instanceof Double) ps.setDouble(i + 1, (Double) a);
                    else if (a instanceof byte[]) ps.setBytes(i + 1, (byte[]) a);
                    else ps.setString(i + 1, a.toString());
                }
                ResultSet rs = ps.executeQuery();
                int n = rs.getMetaData().getColumnCount();
                List<Object[]> out = new ArrayList<Object[]>();
                while (rs.next()) {
                    Object[] row = new Object[n];
                    for (int i = 0; i < n; i++) {
                        Object v = rs.getObject(i + 1);
                        if (v instanceof Integer || v instanceof Short || v instanceof Byte) v = ((Number) v).longValue();
                        else if (v instanceof Float) v = ((Float) v).doubleValue();
                        row[i] = v;
                    }
                    out.add(row);
                }
                rs.close();
                return out;
            } finally {
                ps.close();
            }
        } catch (SQLException e) {
            throw new RuntimeException(e.getMessage() + " in: " + sql, e);
        }
    }
}
