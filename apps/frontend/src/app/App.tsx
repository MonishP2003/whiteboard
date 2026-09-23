import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { NotFoundPage } from "@/components/FullPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { BoardEditorPage } from "@/features/boards/BoardEditorPage";
import { BoardListPage } from "@/features/boards/BoardListPage";
import { RequireAuth } from "./RequireAuth";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/boards"
          element={
            <RequireAuth>
              <BoardListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/boards/:id"
          element={
            <RequireAuth>
              <BoardEditorPage />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/boards" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {/* Above the editor's bottom panels. */}
      <Toaster position="bottom-center" offset={72} richColors closeButton />
    </BrowserRouter>
  );
}
