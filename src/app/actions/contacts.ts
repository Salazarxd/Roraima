"use server";

import prisma from "@/lib/prisma";
import { requireUser, toClientError } from "@/lib/server-auth";

export async function listUserContacts(idToken: string) {
  try {
    const user = await requireUser(idToken);
    const contacts = await prisma.usercontact.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return { success: true as const, contacts };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudieron cargar los contactos"), contacts: [] };
  }
}

export async function saveUserContact(idToken: string, data: { alias: string; email: string }) {
  try {
    const user = await requireUser(idToken);
    const alias = String(data.alias ?? "").trim().slice(0, 50);
    const email = String(data.email ?? "").trim().toLowerCase();

    if (!alias) throw new Error("El nombre o alias del contacto es obligatorio");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Correo inválido");
    if (email === user.email.toLowerCase()) throw new Error("No puedes agregarte a ti mismo como contacto");

    // Verificar si ya existe este correo para el usuario
    const existing = await prisma.usercontact.findFirst({
      where: { userId: user.id, email },
    });

    if (existing) {
      const updated = await prisma.usercontact.update({
        where: { id: existing.id },
        data: { alias },
      });
      return { success: true as const, contact: updated, isNew: false };
    }

    const created = await prisma.usercontact.create({
      data: {
        userId: user.id,
        alias,
        email,
      },
    });

    return { success: true as const, contact: created, isNew: true };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo guardar el contacto") };
  }
}

export async function deleteUserContact(idToken: string, contactId: string) {
  try {
    const user = await requireUser(idToken);
    await prisma.usercontact.deleteMany({
      where: { id: contactId, userId: user.id },
    });
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: toClientError(error, "No se pudo eliminar el contacto") };
  }
}
