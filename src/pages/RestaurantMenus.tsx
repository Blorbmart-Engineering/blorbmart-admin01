import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ImagePlus, Pencil, Plus, Search, Store, Trash2, Upload } from 'lucide-react'
import { adminApi, errorMessage, type FallbackMenuImage, type RestaurantMenuItem, type Row } from '../lib/api'
import { toCompressedDataUrl, uploadImage } from '../lib/image'
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from '../components/ui'

type Editor = {
  id?: string
  name: string
  description: string
  price: string
  discountPrice: string
  section: string
  isAvailable: boolean
  imageSource: 'restaurant' | 'platform'
  imageUrl: string
  imageAssetId: string
}

const blank = (): Editor => ({
  name: '', description: '', price: '', discountPrice: '', section: '', isAvailable: true,
  imageSource: 'restaurant', imageUrl: '', imageAssetId: '',
})

const editorFrom = (item: RestaurantMenuItem): Editor => ({
  id: item.id,
  name: String(item.name || ''),
  description: String(item.description || ''),
  price: String(item.price ?? ''),
  discountPrice: String(item.discountPrice || ''),
  section: String(item.section || ''),
  isAvailable: item.isAvailable !== false && item.status !== 'inactive',
  imageSource: item.imageSource === 'platform' ? 'platform' : 'restaurant',
  imageUrl: String(item.imageUrl || item.images?.[0] || ''),
  imageAssetId: String(item.imageAssetId || ''),
})

export default function RestaurantMenus() {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [selectedStore, setSelectedStore] = useState('')
  const [editing, setEditing] = useState<Editor | null>(null)
  const [uploading, setUploading] = useState(false)

  const restaurants = useQuery({
    queryKey: ['restaurant-menu-restaurants', search],
    queryFn: () => adminApi.restaurantMenuRestaurants(search),
  })
  const menu = useQuery({
    queryKey: ['restaurant-menu', selectedStore],
    queryFn: () => adminApi.restaurantMenu(selectedStore),
    enabled: Boolean(selectedStore),
  })
  const fallback = useQuery({ queryKey: ['fallback-menu-images'], queryFn: adminApi.fallbackMenuImages, staleTime: Infinity })

  const save = useMutation({
    mutationFn: () => {
      const body: Row = {
        name: editing!.name,
        description: editing!.description,
        price: Number(editing!.price),
        discountPrice: editing!.discountPrice ? Number(editing!.discountPrice) : 0,
        section: editing!.section,
        isAvailable: editing!.isAvailable,
        images: editing!.imageUrl ? [editing!.imageUrl] : [],
        imageSource: editing!.imageSource,
        imageAssetId: editing!.imageSource === 'platform' ? editing!.imageAssetId : null,
      }
      return editing!.id
        ? adminApi.updateRestaurantMenuItem(selectedStore, editing!.id, body)
        : adminApi.createRestaurantMenuItem(selectedStore, body)
    },
    onSuccess: () => {
      toast.success(editing?.id ? 'Menu item updated' : 'Menu item added')
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ['restaurant-menu', selectedStore] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save menu item.')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteRestaurantMenuItem(selectedStore, id),
    onSuccess: () => {
      toast.success('Menu item deleted')
      queryClient.invalidateQueries({ queryKey: ['restaurant-menu', selectedStore] })
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete menu item.')),
  })

  const onUpload = async (file: File | undefined) => {
    if (!file || !editing) return
    setUploading(true)
    try {
      const dataUrl = await toCompressedDataUrl(file, 1400)
      const url = await uploadImage(dataUrl, 'menu')
      setEditing({ ...editing, imageSource: 'restaurant', imageUrl: url, imageAssetId: '' })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload that image.')
    } finally {
      setUploading(false)
    }
  }

  const store = restaurants.data?.find((row) => String(row.id) === selectedStore)
  const items = menu.data?.items ?? []

  return (
    <>
      <PageHeader
        title="Restaurant menus"
        subtitle="Create and manage a restaurant’s menu from the super-admin console."
        actions={selectedStore ? <Button size="sm" icon={Plus} onClick={() => setEditing(blank())}>Add menu item</Button> : null}
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card title="Restaurants" subtitle="Choose the restaurant you are helping.">
          <form onSubmit={(event) => { event.preventDefault(); restaurants.refetch() }} className="mb-3 flex gap-2">
            <Input aria-label="Search restaurants" placeholder="Search restaurants" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1" />
            <Button type="submit" size="sm" icon={Search}>Find</Button>
          </form>
          <div className="space-y-1">
            {(restaurants.data ?? []).map((restaurant) => (
              <button
                key={String(restaurant.id)}
                onClick={() => setSelectedStore(String(restaurant.id))}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] ${selectedStore === String(restaurant.id) ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-raised'}`}
              >
                <Store className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0"><span className="block truncate font-semibold">{String(restaurant.name)}</span><span className="block truncate text-[11px] opacity-70">{String(restaurant.campus || 'Campus not set')}</span></span>
              </button>
            ))}
            {!restaurants.isLoading && !restaurants.data?.length && <p className="py-4 text-[12.5px] text-ink-faint">No restaurants found.</p>}
          </div>
        </Card>

        {!selectedStore ? (
          <Card><Empty icon={Store} title="Select a restaurant" message="Choose a restaurant to view or build its menu." /></Card>
        ) : (
          <Card
            title={String(store?.name || menu.data?.store?.storeName || 'Restaurant menu')}
            subtitle={`${items.length} menu item${items.length === 1 ? '' : 's'}`}
            actions={<Badge tone="info">Admin-managed</Badge>}
          >
            {menu.isLoading ? <p className="text-[13px] text-ink-faint">Loading menu…</p> : menu.isError ? <p className="text-[13px] text-bad">{errorMessage(menu.error)}</p> : items.length === 0 ? <Empty icon={Store} title="Menu is empty" message="Add the restaurant’s first menu item." action={<Button size="sm" icon={Plus} onClick={() => setEditing(blank())}>Add item</Button>} /> : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-xl border border-line bg-raised">
                    <div className="relative h-36 bg-surface-sunk">
                      {item.images?.[0] ? <img src={item.images[0]} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-ink-faint"><ImagePlus /></div>}
                      {item.imageSource === 'platform' && <Badge className="absolute left-2 top-2" tone="info">Fallback image</Badge>}
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold text-ink">{item.name}</p><p className="text-[12px] text-ink-faint">{item.section || 'Unsectioned'}</p></div><p className="font-semibold text-ink">₦{Number(item.discountPrice || item.price).toLocaleString()}</p></div>
                      <div className="flex gap-2"><Button size="sm" icon={Pencil} onClick={() => setEditing(editorFrom(item))}>Edit</Button><Button size="sm" variant="danger" icon={Trash2} loading={remove.isPending} onClick={() => { if (window.confirm(`Delete ${item.name}?`)) remove.mutate(item.id) }}>Delete</Button></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <Modal open={Boolean(editing)} onClose={() => !save.isPending && setEditing(null)} title={editing?.id ? 'Edit menu item' : 'Add menu item'} wide footer={editing && <><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save item</Button></>}>
        {editing && <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2"><Input label="Item name" placeholder="Jollof rice and chicken" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /><Input label="Section" placeholder="Rice dishes" value={editing.section} onChange={(e) => setEditing({ ...editing, section: e.target.value })} /></div>
          <Textarea label="Description" rows={3} placeholder="What the customer should know" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2"><Input label="Price" type="number" min="1" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /><Input label="Discount price (optional)" type="number" min="0" value={editing.discountPrice} onChange={(e) => setEditing({ ...editing, discountPrice: e.target.value })} /></div>
          <div><p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Item picture</p><div className="flex flex-wrap gap-2"><Button size="sm" variant={editing.imageSource === 'restaurant' ? 'primary' : 'outline'} icon={Upload} onClick={() => input.current?.click()}>Upload restaurant photo</Button><Button size="sm" variant={editing.imageSource === 'platform' ? 'primary' : 'outline'} onClick={() => setEditing({ ...editing, imageSource: 'platform', imageUrl: '', imageAssetId: '' })}>Choose fallback image</Button></div><input ref={input} className="hidden" type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void onUpload(file) }} />{uploading && <p className="mt-2 text-[12px] text-ink-faint">Uploading photo…</p>}{editing.imageUrl && <img src={editing.imageUrl} alt="Selected item" className="mt-3 h-32 w-32 rounded-lg object-cover" />}</div>
          {editing.imageSource === 'platform' && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(fallback.data ?? []).map((image: FallbackMenuImage) => <button key={image.id} onClick={() => setEditing({ ...editing, imageUrl: image.url, imageAssetId: image.id })} className={`overflow-hidden rounded-lg border text-left ${editing.imageAssetId === image.id ? 'border-brand ring-2 ring-brand/30' : 'border-line'}`}><img src={image.url} alt="" className="h-20 w-full object-cover" /><span className="block truncate px-2 py-1.5 text-[11px] font-semibold text-ink">{image.title}</span></button>)}</div>}
          <label className="flex items-center gap-2 text-[13px] text-ink-soft"><input type="checkbox" checked={editing.isAvailable} onChange={(e) => setEditing({ ...editing, isAvailable: e.target.checked })} /> Available to customers immediately</label>
        </div>}
      </Modal>
    </>
  )
}
