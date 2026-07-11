import {
  customerCreate, customerUpdate, materialCreate, materialUpdate,
  productCreate, productUpdate, supplierCreate, supplierUpdate,
} from '@gym/shared';
import { Customer, Material, Product, Supplier } from '../models';
import { masterDataRouter } from './crudFactory';
import { serializeCustomer, serializeMaterial, serializeProduct, serializeSupplier } from '../serializers';

export const materialsRouter = masterDataRouter({
  model: Material as never, createSchema: materialCreate, updateSchema: materialUpdate,
  serialize: serializeMaterial as never, searchFields: ['name'],
});
export const productsRouter = masterDataRouter({
  model: Product as never, createSchema: productCreate, updateSchema: productUpdate,
  serialize: serializeProduct as never, searchFields: ['name', 'variant', 'sku'],
});
export const suppliersRouter = masterDataRouter({
  model: Supplier as never, createSchema: supplierCreate, updateSchema: supplierUpdate,
  serialize: serializeSupplier as never, searchFields: ['name', 'phone'],
});
export const customersRouter = masterDataRouter({
  model: Customer as never, createSchema: customerCreate, updateSchema: customerUpdate,
  serialize: serializeCustomer as never, searchFields: ['name', 'phone'],
});
