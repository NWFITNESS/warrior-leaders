-- Email attachments: uploaded straight from the admin's browser (Vercel caps request bodies at 4.5 MB),
-- then Resend fetches each file by a short-lived signed URL. Private; staff only.
insert into storage.buckets (id, name, public, file_size_limit)
values ('wl-email-attachments', 'wl-email-attachments', false, 41943040)
on conflict (id) do nothing;

create policy "wl staff upload email attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'wl-email-attachments' and public.wl_is_staff());
create policy "wl staff read email attachments" on storage.objects for select to authenticated
  using (bucket_id = 'wl-email-attachments' and public.wl_is_staff());
create policy "wl staff delete email attachments" on storage.objects for delete to authenticated
  using (bucket_id = 'wl-email-attachments' and public.wl_is_staff());
